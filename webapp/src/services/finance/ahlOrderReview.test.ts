import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAhlOrderHistory } from '../../lib/ahlOrderHistory';
import { createEmptyPSXWorkbook } from '../../store/defaultPsxWorkbook';
import { PSX_WORKBOOK_STORAGE_KEY, usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { applyAhlOrderReview, prepareAhlOrderReview } from './ahlOrderReview';

const auth = vi.hoisted(() => ({ uid: 'fixture-owner' }));
vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => auth }));

const ahl = 'psx-al-habib-capital-markets';
const other = 'psx-js-zindigi';
const header = ['Scrip', 'Quantity', 'Gross Rate', 'Type', 'Execution Date', 'Clearing Date'];
const buy = ['OGDC', '2', '312.73', 'BUY', '13/11/2026', '16/11/2026'];
const sell = ['OGDC', '2', '313.05', 'SELL', '16/11/2026', '17/11/2026'];
const fills = parseAhlOrderHistory([[header, buy, buy, sell]]);
const store = usePSXWorkbookStore.getState;
const selection = (...indexes: number[]) => new Set(indexes.map(index => fills[index].sourceId));
const preview = () => prepareAhlOrderReview(fills, ahl, auth.uid);

describe('AHL order-history review and persistence', () => {
  beforeEach(() => {
    auth.uid = 'fixture-owner';
    store().setWorkbook(createEmptyPSXWorkbook());
    store().setActiveBroker(ahl);
  });

  it('saves distinct identical fills only in the AHL ledger and skips them on replay', () => {
    expect(applyAhlOrderReview(preview(), selection(0, 1, 2))).toBe(3);
    const trades = store().workbook.transactions;
    expect(trades).toHaveLength(3);
    expect(new Set(trades.map(trade => trade.id)).size).toBe(3);
    expect(trades.every(trade => trade.brokerId === ahl)).toBe(true);
    expect(trades.map(trade => trade.date)).toEqual(['2026-11-13', '2026-11-13', '2026-11-16']);
    expect(preview().rows.map(row => row.status)).toEqual(['existing', 'existing', 'existing']);
    expect(() => applyAhlOrderReview(preview(), selection(0))).toThrow(/available fill/);
    store().setActiveBroker(other);
    expect(store().workbook.transactions).toEqual([]);
    store().setActiveBroker(ahl);
    expect(store().workbook.transactions).toEqual(trades);
  });

  it('preserves a matching manual trade and adds an overlapping fill only when selected', () => {
    store().addTransaction({ date: '2026-11-13', ticker: 'OGDC', shares: 2, price: 312.73, action: 'BUY', feeOverride: 1 });
    const review = preview();
    expect(review.rows.map(row => row.status)).toEqual(['existing', 'overlap', 'new']);
    expect(applyAhlOrderReview(review, selection(1))).toBe(1);
    expect(store().workbook.transactions).toHaveLength(2);
    expect(store().workbook.transactions[0].feeOverride).toBe(1);
    expect(preview().rows.map(row => row.status)).toEqual(['existing', 'existing', 'new']);
  });

  it('rejects stale reviews after broker or account changes', () => {
    const review = preview();
    store().setActiveBroker(other);
    expect(() => applyAhlOrderReview(review, selection(0))).toThrow();
    expect(store().workbook.transactions).toEqual([]);
    store().setActiveBroker(ahl);
    auth.uid = 'different-owner';
    expect(() => applyAhlOrderReview(review, selection(0))).toThrow(/account or workbook changed/);
    expect(store().workbook.transactions).toEqual([]);
  });

  it('does not overwrite a newer saved snapshot or apply an unmatched sale', () => {
    const review = preview();
    const snapshot = localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY);
    expect(() => applyAhlOrderReview(review, selection(2))).toThrow(/unmatched OGDC sell shares/);
    expect(localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY)).toBe(snapshot);
    localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, snapshot + '\n');
    expect(() => applyAhlOrderReview(review, selection(0))).toThrow();
    expect(localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY)).toBe(snapshot + '\n');
    expect(store().workbook.transactions).toEqual([]);
  });
});
