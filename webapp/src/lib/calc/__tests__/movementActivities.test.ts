import { expect, it } from 'vitest';
import { CalculationEngine as engine } from '../CalculationEngine';
import type { MovementInputs, MovementKind } from '../movementActivities';
import { createEmptyBankWorkbook } from '../../../store/defaultBankWorkbook';
import { createEmptyCreditCardWorkbook } from '../../../store/defaultCreditCardWorkbook';
import { createEmptyRentalsWorkbook } from '../../../store/defaultRentalsWorkbook';
import { createEmptyPersonalLoansWorkbook } from '../../../store/defaultPersonalLoansWorkbook';
import { createEmptyEMIWorkbook } from '../../../store/defaultEmiWorkbook';
import { createEmptyFundsWorkbook } from '../../../store/defaultFundsWorkbook';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
import { createEmptyPSXWorkbook } from '../../../store/defaultPsxWorkbook';

function fixture(): MovementInputs {
  const bank = createEmptyBankWorkbook(), rentals = createEmptyRentalsWorkbook(), qse = createEmptyWorkbook(), psx = createEmptyPSXWorkbook();
  return { native: { cash: [], bank, rentals, cards: createEmptyCreditCardWorkbook(), personalLoans: createEmptyPersonalLoansWorkbook(), emi: createEmptyEMIWorkbook(), funds: createEmptyFundsWorkbook(), qse, psx },
    base: { cashEntries: [], plannedCash: [], bankAccounts: bank.settings.accounts, bankTransactions: bank.transactions, plannedBank: [], rentalProperties: rentals.settings.properties, rentalEntries: rentals.entries, plannedRentals: [], categories: [] },
    plannedCards: [], categories: [], links: [], qseSettings: qse.settings, psxSettings: psx.settings };
}
const modules = ['cash','bank','rentals','creditCards','personalLoans','emi','funds','qse','psx'];
const collect = (input: MovementInputs, scope = modules) => engine.movements.collectMovementActivities(input,scope,{ fromDate: '2026-01-01', toDate: '2026-02-28', asOf: new Date('2026-01-31T00:00:00Z') });
const report = (input: MovementInputs, kind: MovementKind | 'all' = 'all') => engine.dashboard.moneyMovementReport(collect(input),'2026-01-01','2026-02-28','2026-01-31','kind','actual',{},kind);

it('separates purchases, fees and interest from card repayment transfers and borrowing', () => {
  const f = fixture(); f.native.cards.cards.push({ id: 'c', name: 'Card', currencyCode: 'USD' });
  f.native.cards.transactions.push(...(['charge','payment','cashAdvance','fee','markup'] as const).map((kind,i) => ({ id: kind, cardId: 'c', date: '2026-01-02', kind, amount: [50,50,100,2,3][i], description: kind })));
  expect(report(f,'operating').rows[0].outflow).toBe(-55);
  expect(report(f,'financing').rows[0].inflow).toBe(100);
  expect(report(f,'transfer').rows[0].inflow).toBe(50);
  expect(report(f).count).toBe(4);
});
it('retains rental income once when explicitly linked to a bank deposit, before source filtering', () => {
  const f = fixture();
  f.base.bankAccounts.push({ id: 'b', name: 'Checking', currencyCode: 'USD', openingBalance: 0 });
  f.base.rentalProperties.push({ id: 'p', name: 'Home', currencyCode: 'USD' });
  f.base.bankTransactions.push({ id: 'deposit', accountId: 'b', date: '2026-01-02', amount: 100, description: 'Rent', source: 'manual', isDeposit: true });
  f.base.rentalEntries.push({ id: 'rent', propertyId: 'p', date: '2026-01-02', amount: 100, isDeposit: true });
  f.links.push({ id: 'l', date: '2026-01-02', from: { module: 'rentals',ref: 'p' }, to: { module: 'bank',ref: 'b' }, fromRecordId: 'rent', toRecordId: 'deposit', fromAmount: 100, toAmount: 100 });
  expect(report(f).rows[0]).toMatchObject({ inflow: 100, outflow: 0 });
  expect(collect(f,['bank'])).toEqual([]);
  expect(collect(f,['rentals'])).toHaveLength(1);
});
it('keeps coincident equal amounts without an explicit link unclassified', () => {
  const f = fixture(); f.base.bankAccounts.push({ id: 'b', name: 'Checking', currencyCode: 'USD', openingBalance: 0 });
  f.base.bankTransactions.push(...['one','two'].map(id=>({ id, accountId: 'b', date: '2026-01-02', amount: 100, description: 'Same', source: 'manual' as const, isDeposit: true })));
  expect(report(f).rows[0]).toMatchObject({ inflow: 200 });
  expect(report(f).rows[0].groups[0].key).toBe('unclassified');
});
it('uses real loan repayments and pending state without turning principal contracts into cash receipts', () => {
  const f = fixture();
  f.native.personalLoans.loans.push({ id: 'receive', person: 'A', direction: 'owed_to_me', principal: 900, date: '2026-01-01', currencyCode: 'USD' },{ id: 'pay', person: 'B', direction: 'i_owe', principal: 800, date: '2026-01-01', currencyCode: 'USD' });
  f.native.personalLoans.repayments.push({ id: 'r', loanId: 'receive', date: '2026-01-02', amount: 30 },{ id: 'p', loanId: 'pay', date: '2026-01-02', amount: 20 },{ id: 'wait', loanId: 'pay', date: '2026-01-02', amount: 80, isPending: true });
  expect(report(f,'financing').rows[0]).toMatchObject({ inflow: 30, outflow: -20, net: 10 });
  expect(report(f,'operating').count).toBe(0);
  expect(collect(f)).toHaveLength(3);
});
it('separates recorded installment fines without inventing a principal/interest allocation', () => {
  const f = fixture(); f.native.emi.entries.push({ id: 'e', name: 'Loan', lender: 'Lender', currencyCode: 'USD', principal: 1000, tenureMonths: 10, startDate: '2026-01-01', repaymentMode: 'fixedTotal', totalToReturn: 1100 });
  f.native.emi.repayments.push({ id: 'r', loanId: 'e', month: 1, amount: 100, fine: 5, date: '2026-01-20' });
  expect(report(f,'financing').rows[0].outflow).toBe(-100);
  expect(report(f,'operating').rows[0].outflow).toBe(-5);
});
it('expands card plan dates while excluding completed occurrences from remaining plans', () => {
  const f = fixture(); f.native.cards.cards.push({ id: 'c', name: 'Card', currencyCode: 'QAR' });
  f.plannedCards.push({ id: 'p', cardId: 'c', date: '2026-01-31', amount: 9, kind: 'charge', description: 'Renewal', groupId: 'g', recurrence: { cycle: 'monthly', startDate: '2026-01-31' }, completedDates: ['2026-01-31'] });
  const rows = collect(f); expect(rows.map(row=>row.date)).toEqual(['2026-02-28']);
  expect(rows[0]).toMatchObject({ planGroupId: 'g', executed: false, currencyCode: 'QAR', amount: -9 });
});
it('separates fund purchases, funding transfers and transfer fees', () => {
  const f = fixture(); f.native.funds.funds.push({ id: 'f', name: 'Fund', code: 'F', platform: 'Broker', currencyCode: 'PKR' });
  f.native.funds.transactions.push({ id: 'buy', ticker: 'f', action: 'BUY', date: '2026-01-03', shares: 10, price: 5 });
  f.native.funds.transfers.push({ id: 'deposit', type: 'DEPOSIT', date: '2026-01-02', gross: 100, fee: 2, currencyCode: 'PKR' });
  expect(report(f,'investment').rows[0].outflow).toBe(-50);
  expect(report(f,'operating').rows[0].outflow).toBe(-2);
  expect(report(f).rows[0].net).toBe(-52);
  expect(report(f,'transfer').rows[0].inflow).toBe(100);
});
it('keeps archived brokers, active arrays and each broker fee/currency independent', () => {
  const f = fixture(); const tx = { id: 'same', ticker: 'ABC', action: 'BUY' as const, date: '2026-01-03', shares: 10, price: 5 };
  f.native.qse.activeBrokerId = 'active'; f.native.qse.settings = { ...f.native.qse.settings, currency: 'USD', feePct: 0, minFee: 2 }; f.qseSettings = f.native.qse.settings;
  f.native.qse.transactions.push(tx);
  f.native.qse.brokerProfiles = [{ id: 'active', name: 'Active', settings: f.native.qse.settings, data: { transactions: [], transfers: [], dividends: [], adjustments: [] } },{ id: 'old', name: 'Archived', archived: true, settings: { ...f.qseSettings, currency: 'QAR', minFee: 3 }, data: { transactions: [tx], transfers: [], dividends: [], adjustments: [] } }];
  const rows = report(f).rows;
  expect(rows.find(row=>row.currency==='USD')?.net).toBe(-52);
  expect(rows.find(row=>row.currency==='QAR')?.net).toBe(-53);
  expect(collect(f).filter(row=>row.id==='same').map(row=>row.sourceId)).toEqual(['active','old']);
});
it('withholds pending and future investment orders from cleared actuals', () => {
  const f = fixture(); f.native.funds.funds.push({ id: 'f', name: 'Fund', code: 'F', platform: '', currencyCode: 'USD' });
  f.native.funds.transactions.push({ id: 'a', ticker: 'f', action: 'BUY', date: '2026-01-02', shares: 2, price: 5 },{ id: 'b', ticker: 'f', action: 'SELL', date: '2026-01-02', shares: 2, price: 6, isPending: true },{ id: 'future', ticker: 'f', action: 'SELL', date: '2026-02-02', shares: 2, price: 6 });
  expect(report(f).rows[0].net).toBe(-10);
  expect(report(f).count).toBe(1);
});
it('preserves inputs and reconciles all dimensions and item detail to the same population', () => {
  const f = fixture(); f.native.cards.cards.push({ id: 'c', name: 'Card', currencyCode: 'USD' });
  f.native.cards.transactions.push({ id: 'charge', cardId: 'c', date: '2026-01-02', kind: 'charge', amount: 20, description: 'Food' });
  const before = JSON.stringify(f), activities = collect(f);
  for (const dimension of ['category','module','source','plan','kind'] as const) {
    const row = engine.dashboard.moneyMovementReport(activities,'2026-01-01','2026-01-31','2026-01-31',dimension,'actual').rows[0];
    expect(row.groups.reduce((sum,group)=>sum+group.net,0)).toBe(row.net);
    expect(row.groups.flatMap(group=>group.items).reduce((sum,item)=>sum+item.amount,0)).toBe(-20);
  }
  expect(JSON.stringify(f)).toBe(before);
});
