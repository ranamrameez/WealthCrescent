import { expect, it } from 'vitest';
import { suggestTransferLinks, type TransferCandidate } from './transferLinkSuggestions';
const from: TransferCandidate = { module: 'bank', recordId: 'out', sourceId: 'bank', sourceLabel: 'Savings', description: 'The Group investment [5678]', date: '2026-11-19', amount: 100, currencyCode: 'QAR', direction: 'out', side: { module: 'bank', ref: 'bank' }, url: '/bank', snapshot: '{}' };
const to: TransferCandidate = { ...from, module: 'qse', recordId: 'in', sourceId: 'broker', sourceLabel: 'The Group', description: 'Deposit [5678]', direction: 'in', side: { module: 'qse', ref: 'broker' } };
it('retains competing matches and explains account, identifier and amount evidence', () => {
  const result = suggestTransferLinks([from, to, { ...to, recordId: 'another' }]);
  expect(result).toHaveLength(2);
  expect(result[0].reasons).toContain('Matching identifier');
  expect(result[0].reasons).toContain('Account or broker name in description');
});
it('requires meaningful clues, supported directions, dates and currency-safe amounts', () => {
  for (const invalid of [{ currencyCode: 'USD' }, { amount: 101 }, { date: '2026-11-23' }, { date: '2026-02-30' }, { direction: 'out' as const }]) {
    expect(suggestTransferLinks([from, { ...to, ...invalid }])).toEqual([]);
  }
  expect(suggestTransferLinks([{ ...from, description: 'Transfer' }, { ...to, description: 'Deposit' }])).toEqual([]);
  expect(suggestTransferLinks([{ ...from, module: 'cash', side: { module: 'cash' } }, to])).toEqual([]);
});
it('uses category and keywords and supports card repayment direction only', () => {
  const bank = { ...from, categoryId: 'repayment', description: 'Paid card' };
  const card = { ...to, module: 'creditCard' as const, sourceLabel: 'Card', description: 'Payment', categoryId: 'repayment', side: { module: 'creditCard' as const, ref: 'card' } };
  expect(suggestTransferLinks([bank, card])).toHaveLength(1);
  expect(suggestTransferLinks([{ ...bank, categoryId: undefined }, { ...card, categoryId: undefined }])).toEqual([]);
});
