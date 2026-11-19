import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { acceptTransferSuggestion, scanTransferSuggestions } from './transferSuggestionsService';
vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'fixture' }) }));
const bank = useBankWorkbookStore.getState().workbook;
const cash = useCashWorkbookStore.getState().workbook;
const links = useInterEntityTransfersStore.getState().workbook;
const cards = useCreditCardWorkbookStore.getState().workbook;
const qse = useWorkbookStore.getState().workbook;
const psx = usePSXWorkbookStore.getState().workbook;
const funds = useFundsWorkbookStore.getState().workbook;
const owners = { bank: 'fixture', cash: 'fixture', transfers: 'fixture' };
beforeEach(() => {
  useBankWorkbookStore.setState({ workbook: { ...bank, settings: { ...bank.settings, accounts: [{ id: 'account', name: 'Savings', currencyCode: 'QAR', openingBalance: 0, isActive: true }] }, transactions: [{ id: 'out', timestamp: '2026-11-19T00:00:00Z', accountId: 'account', date: '2026-11-19', amount: -100, isDeposit: false, description: 'ATM [5678]', source: 'manual' }] } });
  useCashWorkbookStore.setState({ workbook: { ...cash, entries: [{ id: 'in', timestamp: '2026-11-19T00:00:00Z', date: '2026-11-20', currencyCode: 'QAR', amount: 100, isDeposit: true, source: 'manual', note: 'ATM [5678]' }] } });
  useInterEntityTransfersStore.setState({ workbook: { ...links, entries: [] } });
});
afterEach(() => {
  useCreditCardWorkbookStore.setState({ workbook: cards });
  useWorkbookStore.setState({ workbook: qse });
  usePSXWorkbookStore.setState({ workbook: psx });
  useFundsWorkbookStore.setState({ workbook: funds });
  useBankWorkbookStore.setState({ workbook: bank });
  useCashWorkbookStore.setState({ workbook: cash });
  useInterEntityTransfersStore.setState({ workbook: links });
});
it('links existing records without rewriting native dates, metadata or amounts and cannot duplicate approval', () => {
  const beforeBank = useBankWorkbookStore.getState().workbook;
  const beforeCash = useCashWorkbookStore.getState().workbook;
  const [reviewed] = scanTransferSuggestions('fixture', owners);
  expect(reviewed).toBeDefined();
  acceptTransferSuggestion(reviewed, owners);
  expect(useBankWorkbookStore.getState().workbook).toEqual(beforeBank);
  expect(useCashWorkbookStore.getState().workbook).toEqual(beforeCash);
  expect(useInterEntityTransfersStore.getState().workbook.entries[0]).toMatchObject({ fromRecordId: 'out', toRecordId: 'in' });
  expect(() => acceptTransferSuggestion(reviewed, owners)).toThrow(/changed/);
});
it('rejects changed or foreign-owner workbooks and excludes pending records', () => {
  const [reviewed] = scanTransferSuggestions('fixture', owners);
  expect(scanTransferSuggestions('fixture', { ...owners, transfers: 'other' })).toEqual([]);
  expect(scanTransferSuggestions('other', { bank: 'other', cash: 'other', transfers: 'other' })).toEqual([]);
  useCashWorkbookStore.getState().updateEntry('in', { note: 'Changed' });
  expect(() => acceptTransferSuggestion(reviewed, owners)).toThrow(/changed/);
  useCashWorkbookStore.getState().updateEntry('in', { isPending: true });
  expect(scanTransferSuggestions('fixture', owners)).toEqual([]);
});

it('adapts card payments and isolated QSE, PSX and Funds cash ledgers', () => {
  const payment = { id: 'payment', timestamp: '2026-11-19T00:00:00Z', cardId: 'card', date: '2026-11-19', amount: 100, kind: 'payment' as const, description: 'ATM [5678]' };
  useCreditCardWorkbookStore.setState({ workbook: { ...cards, cards: [{ id: 'card', name: 'Card', currencyCode: 'QAR' }], transactions: [payment, { ...payment, id: 'charge', kind: 'charge' }] } });
  expect(scanTransferSuggestions('fixture', { ...owners, cash: undefined, cards: 'fixture' }).map(row => row.to.recordId)).toEqual(['payment']);
  for (const [module, store, workbook] of [['qse', useWorkbookStore, qse], ['psx', usePSXWorkbookStore, psx]] as const) {
    const transfer = { id: 'deposit', date: '2026-11-19', gross: 100, fee: 1, type: 'DEPOSIT' as const, description: 'ATM [5678]' };
    store.setState({ workbook: { ...workbook, activeBrokerId: 'active', transfers: [transfer], brokerProfiles: [
      { id: 'active', name: 'Active', settings: { ...workbook.settings, currency: 'QAR' }, data: { transactions: [], transfers: [{ ...transfer, id: 'stale' }], adjustments: [], dividends: [], tradePlans: [] } },
      { id: 'other', name: 'Other', settings: { ...workbook.settings, currency: 'QAR' }, data: { transactions: [], transfers: [{ ...transfer, id: 'other' }], adjustments: [], dividends: [], tradePlans: [] } },
    ] } });
    const matches = scanTransferSuggestions('fixture', { ...owners, cash: undefined, [module]: 'fixture' });
    expect(matches.map(row => row.to.recordId).sort()).toEqual(['deposit', 'other']);
    expect(matches[0].to.side.fee).toBe(1);
    expect(matches[0].to.url).toContain('/brokers?broker=');
    expect(scanTransferSuggestions('fixture', { ...owners, cash: undefined, [module]: 'another' })).toEqual([]);
  }
  useFundsWorkbookStore.setState({ workbook: { ...funds, transfers: [{ id: 'fund-deposit', date: '2026-11-19', gross: 100, fee: 0, type: 'DEPOSIT', currencyCode: 'QAR', description: 'ATM [5678]' }] } });
  expect(scanTransferSuggestions('fixture', { ...owners, cash: undefined, funds: 'fixture' }).map(row => row.to.recordId)).toEqual(['fund-deposit']);
});
