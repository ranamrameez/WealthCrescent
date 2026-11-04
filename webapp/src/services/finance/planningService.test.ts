import { describe, expect, it, vi } from 'vitest';
import { getPlanningHierarchy, getPlanningOverview, savePlannedPayment, relinkPlannedPayments, deletePlannedPayment, subscribePlanning } from './planningService';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';

const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: 'query-test' } : null; } }, db: null, firebaseReady: false }));

const filters = { fromDate: '2026-11-01', toDate: '2026-11-30', direction: 'all', category: 'all', source: 'all' };
describe('Planning queries', () => {
  it('keeps stable snapshots and invalidates both queries on native plan changes', () => {
    const store = usePlannedCashWorkbookStore.getState(), original = store.workbook;
    const listener = vi.fn(), unsubscribe = subscribePlanning(listener);
    try {
      const before = getPlanningOverview(filters), hierarchy = getPlanningHierarchy(filters);
      expect(getPlanningOverview({ ...filters })).toBe(before);
      expect(getPlanningHierarchy(filters)).toBe(hierarchy);
      store.setWorkbook({ ...original, entries: [{ id: 'query', date: '2026-11-04', type: 'OUT', amount: 25, currencyCode: 'QAR' }] });
      expect(listener).toHaveBeenCalled();
      expect(getPlanningOverview(filters)).not.toBe(before);
      expect(getPlanningHierarchy(filters)).not.toBe(hierarchy);
      expect(getPlanningHierarchy(filters).rows).toContainEqual(expect.objectContaining({ plan: expect.objectContaining({ id: 'query' }) }));
    } finally { unsubscribe(); store.setWorkbook(original); }
  });

  it('enforces sign-in at the command boundary even when the UI is bypassed', () => {
    session.signedIn = false;
    try {
      expect(() => deletePlannedPayment({ module: 'cash', id: 'missing' })).toThrow('Sign in');
      expect(() => relinkPlannedPayments([], 'cash', '', 'QAR', false)).toThrow('Sign in');
      expect(() => savePlannedPayment({ groupId: '', module: 'cash', ref: '', currency: 'QAR', date: '2026-11-04', amount: '25', direction: 'out', cardKind: 'charge', description: 'Bill', category: '' })).toThrow('Sign in');
    } finally { session.signedIn = true; }
  });

  it('refreshes due statuses across midnight without a store write', () => {
    const store = usePlannedCashWorkbookStore.getState(), original = store.workbook;
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T23:59:30Z'));
    const listener = vi.fn(), unsubscribe = subscribePlanning(listener);
    try {
      store.setWorkbook({ ...original, entries: [{ id: 'midnight', date: '2026-11-04', type: 'OUT', amount: 25, currencyCode: 'QAR' }] });
      listener.mockClear();
      const before = getPlanningHierarchy(filters);
      expect(before.rows[0].status).toBe('Planned');
      vi.advanceTimersByTime(60_000);
      expect(listener).toHaveBeenCalled();
      const after = getPlanningHierarchy(filters);
      expect(after).not.toBe(before);
      expect(after.rows[0].status).toBe('Pending');
    } finally { unsubscribe(); vi.useRealTimers(); store.setWorkbook(original); }
  });

  it('rejects stale payment writes and invalid amounts without changing the plan', () => {
    const store = usePlannedCashWorkbookStore.getState(), workbook = store.workbook;
    const original = { id: 'edit', date: '2026-11-04', type: 'OUT' as const, amount: 25, currencyCode: 'QAR' };
    const input = { reference: { module: 'cash' as const, id: 'edit' }, original, groupId: '', module: 'cash' as const, ref: '', currency: 'QAR', date: '2026-11-04', amount: '30', direction: 'out' as const, cardKind: 'charge' as const, description: 'Bill', category: '' };
    try {
      store.setWorkbook({ ...workbook, entries: [{ ...original, amount: 50 }] });
      expect(() => savePlannedPayment(input)).toThrow('changed');
      expect(() => savePlannedPayment({ ...input, amount: '-1' })).toThrow('positive amount');
      expect(usePlannedCashWorkbookStore.getState().workbook.entries[0].amount).toBe(50);
    } finally { store.setWorkbook(workbook); }
  });
});
