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

it('includes only active, uncovered renewal estimates in the planned movement population', () => {
  const f = fixture();
  const membership = { id: 'streaming', name: 'Streaming', amount: 15, currencyCode: 'USD', billingCycle: 'monthly' as const, startDate: '2025-12-31', active: true };
  f.subscriptions = [membership, { ...membership, id: 'cancelled', active: false }];
  f.base.plannedCash.push({ id: 'funded', date: '2026-01-31', amount: 14.5, currencyCode: 'USD', type: 'OUT', sourceSubscriptionId: membership.id });
  f.base.bankAccounts.push({ id: 'archived', name: 'Old account', currencyCode: 'USD', openingBalance: 0, isActive: false });
  f.base.plannedBank.push({ id: 'stale-funding', date: '2026-02-28', amount: -15, accountId: 'archived', description: 'Old renewal plan', sourceSubscriptionId: membership.id });
  const rows = collect(f, ['cash', 'bank', 'subscriptions']);
  expect(rows.map(row => [row.id, row.amount, row.recordType])).toEqual([
    ['funded', -14.5, 'plan'],
    ['streaming@2026-02-28', -15, 'subscription-estimate'],
  ]);
  expect(engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', '2026-02-28', 'actual')).toEqual([]);
  expect(engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', '2026-02-28', 'pending')).toEqual([]);
  expect(collect(f, ['cash']).map(row => row.id)).toEqual(['funded']);
});

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

it('reconciles monthly widgets with the exact report population and partial-month dates', () => {
  const f = fixture(); f.native.cards.cards.push({ id: 'c', name: 'Card', currencyCode: 'USD' });
  f.native.cards.transactions.push(...[
    { id: 'before', date: '2026-01-01', amount: 500 },
    { id: 'inside', date: '2026-01-20', amount: 20 },
    { id: 'future', date: '2026-02-01', amount: 900 },
  ].map(tx=>({ ...tx, cardId: 'c', kind: 'charge' as const, description: 'Charge' })));
  const data = collect(f);
  const monthly = engine.movements.monthlyMovementReport(data,'2026-01-15','2026-03-05','2026-01-31','actual','operating');
  expect(monthly.months).toEqual(['2026-01','2026-02','2026-03']);
  expect(monthly.rows[0].months.map(row=>row.netFlow)).toEqual([-20,0,0]);
  const total = engine.dashboard.moneyMovementReport(data,'2026-01-15','2026-03-05','2026-01-31','category','actual',{},'operating').rows[0];
  expect(monthly.rows[0].months.reduce((sum,row)=>sum+row.netFlow,0)).toBe(total.net);
  expect(monthly.rows[0].months.reduce((sum,row)=>sum+row.count,0)).toBe(1);
});
it('keeps monthly pending, planned and actual totals separate and preserves native currencies', () => {
  const data = [
    { id: 'actual', module: 'cash' as const, date: '2026-01-02', currencyCode: 'USD', amount: 10, sourceLabel: 'Cash', description: '', executed: true },
    { id: 'pending', module: 'cash' as const, date: '2026-01-02', currencyCode: 'USD', amount: -30, sourceLabel: 'Cash', description: '', executed: true, isPending: true },
    { id: 'plan', module: 'cash' as const, date: '2026-01-02', currencyCode: 'QAR', amount: -80, sourceLabel: 'Cash', description: '', executed: false },
  ];
  for (const [population,expected,currency] of [['actual',10,'USD'],['pending',-30,'USD'],['planned',-80,'QAR']] as const) {
    const row = engine.movements.monthlyMovementReport(data,'2026-01-01','2026-01-31','2026-01-31',population).rows[0];
    expect(row.currency).toBe(currency); expect(row.months[0].netFlow).toBe(expected);
  }
});
it('handles invalid, reversed and maximum-year monthly boundaries without looping past the range', () => {
  const query = (from: string,to: string) => engine.movements.monthlyMovementReport([],from,to,'9999-12-31','actual').months;
  expect(query('9999-12-01','9999-12-31')).toEqual(['9999-12']);
  expect(query('2026-02-30','2026-03-31')).toEqual([]);
  expect(query('2026-03-01','2026-01-31')).toEqual([]);
});
it('does not hide a trade that shares a linked transfer ID in the same broker',()=>{
  const f=fixture();f.native.qse.brokerProfiles=[];f.native.qse.settings={...f.qseSettings,feePct:0,minFee:0,currency:'USD'};f.qseSettings=f.native.qse.settings;
  f.base.bankAccounts.push({id:'bank',name:'Checking',currencyCode:'USD',openingBalance:0});
  f.base.bankTransactions.push({id:'bank-leg',accountId:'bank',date:'2026-01-02',amount:-100,isDeposit:false,source:'manual',description:'Broker funding'});
  f.native.qse.transfers.push({id:'same',date:'2026-01-02',type:'DEPOSIT',gross:100,fee:0});
  f.native.qse.transactions.push({id:'same',date:'2026-01-02',ticker:'ABC',action:'BUY',shares:10,price:5});
  f.links.push({id:'link',date:'2026-01-02',from:{module:'bank',ref:'bank'},to:{module:'qse',ref:'legacy'},fromRecordId:'bank-leg',toRecordId:'same',fromAmount:100,toAmount:100});
  expect(report(f,'investment').rows[0].outflow).toBe(-50);
  expect(report(f).count).toBe(1);
});
it('classifies explicit fulfilled source provenance without guessing from descriptions or categories',()=>{
  const f=fixture();f.base.bankAccounts.push({id:'bank',name:'Checking',currencyCode:'USD',openingBalance:0});
  f.base.cashEntries.push({id:'subscription',date:'2026-01-02',amount:20,isDeposit:false,currencyCode:'USD',source:'manual',planLink:{module:'cash',planId:'subscription-plan',occurrenceDate:'2026-01-02',source:{module:'subscription',id:'subscription'}}});
  f.base.bankTransactions.push({id:'loan',accountId:'bank',date:'2026-01-02',amount:-100,isDeposit:false,source:'manual',description:'Installment',planLink:{module:'bank',planId:'loan-plan',occurrenceDate:'2026-01-02',source:{module:'emi',id:'loan'}}},{id:'legacy',accountId:'bank',date:'2026-01-02',amount:-30,isDeposit:false,source:'manual',description:'Installment'});
  f.native.cards.cards.push({id:'card',name:'Card',currencyCode:'USD'});
  f.native.cards.transactions.push({id:'card-loan',cardId:'card',date:'2026-01-02',kind:'charge',amount:50,description:'Installment',planLink:{module:'creditCard',planId:'card-plan',occurrenceDate:'2026-01-02',source:{module:'emi',id:'loan'}}});
  expect(report(f,'operating').rows[0].outflow).toBe(-20);
  expect(report(f,'financing').rows[0].outflow).toBe(-150);
  expect(report(f).rows[0].groups.find(group=>group.key==='unclassified')?.outflow).toBe(-30);
});

it('counts a linked card-funded installment once, with the receipt as the financing record', () => {
  const f = fixture();
  f.native.emi.entries.push({ id: 'loan', name: 'Loan', lender: 'Seller', principal: 500, totalToReturn: 500, currencyCode: 'USD', tenureMonths: 1, startDate: '2026-01-01', repaymentMode: 'fixedTotal' });
  f.native.cards.cards.push({ id: 'card', name: 'Card', currencyCode: 'USD' });
  f.native.cards.transactions.push({ id: 'charge', cardId: 'card', date: '2026-01-02', kind: 'charge', amount: 50, description: 'Installment' });
  f.native.emi.repayments.push({ id: 'receipt', loanId: 'loan', date: '2026-01-02', month: 0, amount: 50, paymentOnly: true });
  f.links.push({ id: 'link', date: '2026-01-02', from: { module: 'creditCard', ref: 'card' }, to: { module: 'emi', ref: 'loan', emiIndependent: true }, fromRecordId: 'charge', toRecordId: 'receipt', fromAmount: 50, toAmount: 50 });
  expect(report(f, 'financing').rows[0].outflow).toBe(-50);
  expect(report(f).count).toBe(1);
});

it.each(['cash', 'bank'] as const)('retains %s funding when the linked installment receipt is missing', module => {
  const f = fixture();
  const date = '2026-01-02';
  f.native.emi.entries.push({ id: 'loan', name: 'Loan', lender: 'Seller', principal: 500, totalToReturn: 500, currencyCode: 'USD', tenureMonths: 1, startDate: '2026-01-01', repaymentMode: 'fixedTotal' });
  f.base.bankAccounts.push({ id: 'bank', name: 'Checking', currencyCode: 'USD', openingBalance: 0 });
  if (module === 'bank') {
    f.base.bankTransactions.push({ id: 'funding', accountId: 'bank', date, amount: -50, description: 'Installment', source: 'manual', isDeposit: false });
  } else {
    f.base.cashEntries.push({ id: 'funding', currencyCode: 'USD', date, amount: 50, source: 'manual', isDeposit: false });
  }
  f.links.push({ id: 'link', date, from: { module, ref: module === 'bank' ? 'bank' : undefined }, to: { module: 'emi', ref: 'loan', emiIndependent: true }, fromRecordId: 'funding', toRecordId: 'receipt', fromAmount: 50, toAmount: 50 });

  expect(collect(f).map(row => [row.id, row.amount])).toEqual([['funding', -50]]);
  f.native.emi.repayments.push({ id: 'receipt', loanId: 'loan', date, month: 0, amount: 50, paymentOnly: true });
  expect(collect(f).map(row => [row.id, row.amount])).toEqual([['receipt', -50]]);
});

it('keeps linked Cash and Bank occurrences in pending movement without repeating them as plans', () => {
  const f = fixture();
  const date = '2026-01-31';
  const occurrence = (module: 'cash' | 'bank', planId: string) => ({ module, planId, occurrenceDate: date });
  f.base.plannedCash.push({
    id: 'cash-plan', date, amount: 10, currencyCode: 'USD', type: 'OUT',
    recurrence: { cycle: 'monthly', startDate: date },
  });
  f.base.cashEntries.push({
    id: 'cash-pending', date, amount: 10, currencyCode: 'USD', isDeposit: false, source: 'manual',
    isPending: true, planLink: occurrence('cash', 'cash-plan'),
  });
  f.base.bankAccounts.push(
    { id: 'paying', name: 'Paying', currencyCode: 'USD', openingBalance: 0 },
    { id: 'other', name: 'Other', currencyCode: 'USD', openingBalance: 0 },
  );
  f.base.plannedBank.push(
    { id: 'bank-plan', date, accountId: 'paying', amount: -20, description: 'Bill' },
    { id: 'other-plan', date, accountId: 'other', amount: -20, description: 'Other bill' },
  );
  const payment = { date, accountId: 'paying', amount: -20, description: 'Bill', isDeposit: false, isPending: true, source: 'manual' as const };
  f.base.bankTransactions.push(
    { ...payment, id: 'bank-pending', planLink: occurrence('bank', 'bank-plan') },
    { ...payment, id: 'wrong-account', planLink: occurrence('bank', 'other-plan') },
  );

  const rows = collect(f, ['cash', 'bank']);
  const population = (kind: 'actual' | 'pending' | 'planned') =>
    engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', date, kind).map(row => row.id);
  expect(population('planned')).toEqual(['other-plan', 'cash-plan@2026-02-28']);
  expect(population('pending')).toEqual(['bank-pending', 'wrong-account', 'cash-pending']);
  expect(population('actual')).toEqual([]);

  f.base.bankTransactions = [];
  expect(collect(f, ['bank']).map(row => row.id)).toContain('bank-plan');
});

it('includes uncovered rent only as a planned estimate', () => {
  const f = fixture();
  const property = { id: 'lease', name: 'Home', currencyCode: 'QAR', collectionCycle: 'monthly' as const,
    lastCollectionDate: '2026-01-03', monthlyRent: 100, pendingRentBalance: 7 };
  f.base.rentalProperties.push(property, { ...property, id: 'archived', isActive: false },
    { ...property, id: 'ended', leaseEndDate: '2026-02-01' });
  f.base.plannedRentals.push({ id: 'maintenance', propertyId: property.id, date: '2026-02-03', type: 'EXPENSE', amount: 20 });
  const rows = collect(f, ['rentals']);
  expect(rows.filter(row => row.recordType === 'rent-estimate')).toMatchObject([{
    id: 'lease@2026-02-03', currencyCode: 'QAR', amount: 107, executed: false,
  }]);
  expect(engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', '2026-02-28', 'actual')).toEqual([]);
  expect(engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', '2026-02-28', 'pending')).toEqual([]);
  f.base.plannedRentals.push({ id: 'rent', propertyId: property.id, date: '2026-02-03', type: 'RENT_INCOME', amount: 107 });
  expect(collect(f, ['rentals']).map(row => row.id)).toEqual(['maintenance', 'rent']);
});

it('reports the next legacy EMI as planned until an active matching bank plan covers it', () => {
  const f = fixture();
  const loan = { id: 'legacy', name: 'Loan', currencyCode: 'QAR', lender: 'Bank', repaymentMode: 'fixedTotal' as const,
    principal: 1200, totalToReturn: 1200, tenureMonths: 12, startDate: '2026-01-01' };
  f.native.emi.entries.push(loan, { ...loan, id: 'independent', contractSchedule: [] });
  f.base.bankAccounts.push({ id: 'checking', name: 'Checking', currencyCode: 'QAR', openingBalance: 0 });
  const estimate = collect(f, ['emi']);
  expect(estimate).toMatchObject([{ date: '2026-02-01', amount: -100, recordType: 'emi-estimate', executed: false }]);
  expect(engine.movements.selectMovementActivities(estimate, '2026-01-01', '2026-02-28', '2026-02-28', 'actual')).toEqual([]);
  f.base.plannedBank.push({ id: 'funding', date: '2026-02-01', amount: -100, accountId: 'checking',
    description: 'Funding for installment', sourceEmiLoanId: loan.id });
  expect(collect(f, ['emi', 'bank']).map(row => row.id)).toEqual(['funding']);
  f.base.bankAccounts[0].isActive = false;
  expect(collect(f, ['emi']).map(row => row.id)).toEqual(['legacy@2026-02-01']);
});

it('reports independent installment remainders after matching eligible planned funding', () => {
  const f = fixture();
  const date = '2026-02-01';
  f.native.emi.entries.push({ id: 'agreement', name: 'Loan', currencyCode: 'QAR', lender: 'Bank',
    repaymentMode: 'fixedTotal', principal: 100, totalToReturn: 100, tenureMonths: 1, startDate: '2026-01-01',
    contractSchedule: [{ id: 'due', dueDate: date, amount: 100, description: 'Installment' }] });
  f.base.plannedCash.push({ id: 'part', date, type: 'OUT', amount: 40, currencyCode: 'QAR',
    sourceEmiLoanId: 'agreement', sourceEmiObligationId: 'due' });
  const rows = collect(f, ['cash', 'emi']);
  expect(rows.map(row => [row.id, row.amount, row.executed])).toEqual([
    ['part', -40, false], ['emi-contract:agreement:due', -60, false],
  ]);
  expect(engine.movements.selectMovementActivities(rows, '2026-01-01', '2026-02-28', '2026-02-28', 'actual')).toEqual([]);
  f.base.plannedCash[0].amount = 110;
  expect(collect(f, ['cash', 'emi']).map(row => [row.id, row.amount])).toEqual([['emi-contract:agreement:due', -100]]);
});
