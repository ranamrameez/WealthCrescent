import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePsxCashStatement, readPsxCashStatement } from '../../lib/psxCashStatement';
import { createEmptyPSXWorkbook } from '../../store/defaultPsxWorkbook';
import { PSX_WORKBOOK_STORAGE_KEY, usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import type { BankTransaction, BankWorkbook } from '../../types/bankWorkbook';
import type { Transfer } from '../../types/workbook';
import { applyPsxCashTransfers, bankCashSources, matchCashTransfers, preparePsxCashTransferReview, previewPsxCashTransfers } from './psxCashTransferReview';

vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'test-user' }) }));

const brokerId = 'psx-al-habib-capital-markets';
const header = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
const example = ['Nov 02,2026', 'FUND TRANSFER VIA - CatRaast example', '0.00', '20,000.00', '20,000.00'];
const transfer = (id: string, date = '2026-11-02', gross = 20000): Transfer =>
  ({ id, date, gross, type: 'DEPOSIT', fee: 0 });
const bankRow = (id: string, description: string, overrides: Partial<BankTransaction> = {}): BankTransaction =>
  ({ id, accountId: 'ubl', date: '2026-11-06', description, amount: -20000, isDeposit: false, source: 'manual', ...overrides });

describe('PSX cash-transfer reconciliation', () => {
  beforeEach(() => {
    usePSXWorkbookStore.getState().setWorkbook(createEmptyPSXWorkbook());
    usePSXWorkbookStore.getState().setActiveBroker(brokerId);
  });

  it('reads only deposit and withdrawal rows from AHL HTML and keeps precise amounts', async () => {
    const lines = [header, example,
      ['Nov 02,2026', 'T+2 Sell ABC', '0', '8,000.00', '28,000.00'],
      ['Nov 02,2026', 'Fund Transfer Fee', '10.00', '0', '27,990.00'],
      ['Nov 03,2026', 'FUND TRANSFER VIA - CatRaast out', '100.25', '0', '27,899.75']];
    const html = '<table>' + lines.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</table>';
    const file = { name: 'statement.html.txt', text: async () => html, size: html.length } as File;
    expect(await readPsxCashStatement(file)).toMatchObject([
      { date: '2026-11-02', type: 'DEPOSIT', gross: 20000 },
      { date: '2026-11-03', type: 'WITHDRAWAL', gross: 100.25 },
    ]);
    expect(() => parsePsxCashStatement([[header, [...example.slice(0, 3), '20,00']]])).toThrow(/Invalid transfer amount/);
  });

  it('finds cleared same-currency AHL bank entries and maps the bank sign to the broker side', () => {
    const bank: BankWorkbook = {
      settings: { accounts: [{ id: 'ubl', name: 'UBL', currencyCode: 'PKR', openingBalance: 0 }] },
      transactions: [
        bankRow('out', 'PSX Al Habib Broker'), bankRow('in', 'AHL PSX', { amount: 42 }),
        bankRow('pending', 'AHL PSX', { isPending: true }), bankRow('ipo', 'PSX IPO ABHI'),
        bankRow('claimed', 'AHL PSX'), bankRow('other', 'AHL PSX', { accountId: 'other-bank' }),
      ],
    };
    expect(bankCashSources(bank, [], brokerId, 'PKR', [{ ...transfer('other-broker'), cashSourceIds: ['bank:claimed'] }])).toMatchObject([
      { sourceId: 'bank:out', type: 'DEPOSIT', gross: 20000, accountName: 'UBL' },
      { sourceId: 'bank:in', type: 'WITHDRAWAL', gross: 42 },
    ]);
  });

  it('prioritizes exact matches and separates an extra existing transfer', () => {
    const rows = parsePsxCashStatement([[header, example]]);
    const ledger = [transfer('wrong-date', '2026-11-06'), transfer('exact')];
    const review = matchCashTransfers(rows, ledger);
    expect(review.rows[0]).toMatchObject({ status: 'mismatch', candidates: [ledger[1]] });
    expect(review.existingOnly).toEqual([ledger[0]]);
  });

  it('requires an explicit choice when identical source rows compete for one existing record', () => {
    const statement = parsePsxCashStatement([[header, example, example]]);
    const store = usePSXWorkbookStore.getState();
    store.addTransfer(transfer('manual'));
    const preview = previewPsxCashTransfers(statement);
    expect(preview.rows.map(row => row.status)).toEqual(['ambiguous', 'ambiguous']);
    expect(() => applyPsxCashTransfers(preview, new Map(statement.map(row => [row.sourceId, { action: 'keep', id: 'manual' }])))).toThrow(/different existing transfer/);
    expect(usePSXWorkbookStore.getState().workbook.transfers).toHaveLength(1);
    applyPsxCashTransfers(preview, new Map([
      [statement[0].sourceId, { action: 'keep', id: 'manual' }],
      [statement[1].sourceId, { action: 'add' }],
    ]));
    expect(previewPsxCashTransfers(statement).rows.map(row => row.status)).toEqual(['mismatch', 'matched']);
    expect(usePSXWorkbookStore.getState().workbook.transfers).toHaveLength(2);
    expect(() => applyPsxCashTransfers(preview, new Map([[statement[1].sourceId, { action: 'add' }]]))).toThrow(/ledger changed/);
  });

  it('updates just the chosen broker transfer, preserving its fee and ID', () => {
    const store = usePSXWorkbookStore.getState();
    store.addTransfer({ ...transfer('unaffected', '2026-10-01', 45), fee: 2, description: 'Other broker', brokerId: 'psx-js-zindigi' });
    const unaffected = usePSXWorkbookStore.getState().workbook.brokerProfiles
      .find(profile => profile.id === 'psx-js-zindigi')?.data?.transfers[0];
    store.addTransfer({ ...transfer('to-correct', '2026-11-06'), fee: 5 });
    const statement = parsePsxCashStatement([[header, example]]);
    const { sourceId } = statement[0];
    const preview = previewPsxCashTransfers(statement);
    expect(preview.rows[0].status).toBe('ambiguous');
    applyPsxCashTransfers(preview, new Map([[sourceId, { action: 'replace', id: 'to-correct' }]]));
    expect(usePSXWorkbookStore.getState().workbook.transfers).toMatchObject([
      { id: 'to-correct', date: '2026-11-02', fee: 5, cashSourceIds: [sourceId] },
    ]);
    store.setActiveBroker('psx-js-zindigi');
    expect(usePSXWorkbookStore.getState().workbook.transfers).toEqual([unaffected]);
  });

  it('infers month-first dates from the statement and rejects unresolved numeric dates', () => {
    const us = ['11/02/2026', ...example.slice(1)];
    expect(() => parsePsxCashStatement([[header, us]])).toThrow(/Ambiguous numeric date/);
    const later = ['11/14/2026', ...example.slice(1)];
    expect(parsePsxCashStatement([[header, us, later]]).map(row => row.date)).toEqual(['2026-11-02', '2026-11-14']);
  });

  it('distinguishes otherwise identical statement movements by running balance', () => {
    const single = parsePsxCashStatement([[header, example]])[0];
    const duplicate = parsePsxCashStatement([[header, [...example.slice(0, 4), '40,000.00']]])[0];
    expect(single.sourceId).not.toBe(duplicate.sourceId);
    const existing = { ...transfer('recorded'), cashSourceIds: [single.sourceId] };
    expect(matchCashTransfers([duplicate], [existing]).rows[0]).toMatchObject({ status: 'ambiguous', candidates: [existing] });
  });

  it('rejects a shared-storage change and leaves the in-memory ledger untouched on a failed write', () => {
    const statement = parsePsxCashStatement([[header, example]]);
    const preview = preparePsxCashTransferReview(statement);
    const choice = new Map([[statement[0].sourceId, { action: 'add' as const }]]);
    localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, '{}');
    expect(() => applyPsxCashTransfers(preview, choice)).toThrow(/saved ledger changed/);
    localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, preview.persistedSnapshot!);
    const mock = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    try {
      expect(() => applyPsxCashTransfers(preview, choice)).toThrow(/Quota exceeded/);
      expect(usePSXWorkbookStore.getState().workbook.transfers).toEqual([]);
    } finally {
      mock.mockRestore();
    }
  });

});

describe('statement amount authority', () => {
  beforeEach(() => {
    usePSXWorkbookStore.getState().setWorkbook(createEmptyPSXWorkbook());
    usePSXWorkbookStore.getState().setActiveBroker(brokerId);
  });

  it('reconciles a rounded statement to existing precision while applying the statement description', () => {
    usePSXWorkbookStore.getState().addTransfer(transfer('precise', '2026-11-02', 20000.42));
    const statement = parsePsxCashStatement([[header, ['2026-11-02', 'Fund transfer', '0', '20,000', '20,000']]]);
    const review = preparePsxCashTransferReview(statement);
    expect(review.rows[0].status).toBe('mismatch');
    expect(review.rows[0].candidates.map(row => row.id)).toEqual(['precise']);
    applyPsxCashTransfers(review, new Map([[statement[0].sourceId, { action: 'replace', id: 'precise' }]]));
    expect(usePSXWorkbookStore.getState().workbook.transfers).toMatchObject([
      { id: 'precise', gross: 20000.42, description: 'Fund transfer' },
    ]);
    expect(preparePsxCashTransferReview(statement).rows[0].status).toBe('matched');
  });

  it('requires the statement figure for a conflict at the displayed precision', () => {
    usePSXWorkbookStore.getState().addTransfer(transfer('precise', '2026-11-02', 20000.42));
    const statement = parsePsxCashStatement([[header, ['2026-11-02', 'Fund transfer', '0', '20,000.00', '20,000.00']]]);
    const review = preparePsxCashTransferReview(statement);
    expect(() => applyPsxCashTransfers(review, new Map([[statement[0].sourceId, { action: 'keep', id: 'precise' }]])))
      .toThrow(/Use the statement amounts/);
    applyPsxCashTransfers(review, new Map([[statement[0].sourceId, { action: 'replace', id: 'precise' }]]));
    expect(usePSXWorkbookStore.getState().workbook.transfers).toMatchObject([{ id: 'precise', gross: 20000 }]);
  });
});
