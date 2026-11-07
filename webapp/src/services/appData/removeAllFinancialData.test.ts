import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { currentUser: { uid: 'owner' } as { uid: string } | null }, update: vi.fn(), reset: vi.fn() }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, update: mocks.update }));
vi.mock('../../lib/firebase/client', () => ({ auth: mocks.auth, db: {}, firebaseReady: true }));
vi.mock('../../lib/resetLocalData', () => ({ resetAllLocalWorkbooks: mocks.reset }));
import { removeAllFinancialData } from './removeAllFinancialData';
import { workbookSyncEpoch, workbookSyncPaused } from '../../lib/firebase/workbookMaintenance';
beforeEach(() => { vi.clearAllMocks(); mocks.auth.currentUser = { uid: 'owner' }; mocks.update.mockResolvedValue(undefined); });
it('atomically replaces all 18 module paths under only the confirmed user', async () => {
  const epoch = workbookSyncEpoch();
  await removeAllFinancialData('owner');
  expect(mocks.update).toHaveBeenCalledTimes(1);
  const [path, data] = mocks.update.mock.calls[0];
  expect(path).toBe('users/owner');
  expect(Object.keys(data)).toHaveLength(18);
  expect(data.workbook.transactions).toEqual([]);
  expect(data.plannedCash.entries).toEqual([]);
  expect(data.bank.transactions).toEqual([]);
  expect(data.categoryGroups.groups).toEqual([]);
  expect(data).not.toHaveProperty('appearance');
  expect(data).not.toHaveProperty('marketData');
  expect(mocks.reset).toHaveBeenCalledTimes(1);
  expect(workbookSyncEpoch()).toBeGreaterThan(epoch);
  expect(workbookSyncPaused()).toBe(false);
});
it('rejects changed identity before any write', async () => {
  await expect(removeAllFinancialData('other')).rejects.toThrow('sign-in changed');
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.reset).not.toHaveBeenCalled();
});
it('keeps local reset conditional on acknowledged cloud success and releases maintenance on failure', async () => {
  mocks.update.mockRejectedValue(new Error('Permission denied'));
  await expect(removeAllFinancialData('owner')).rejects.toThrow('Permission denied');
  expect(mocks.reset).not.toHaveBeenCalled(); expect(workbookSyncPaused()).toBe(false);
});
it('does not clear a different account after a sign-in change during the request', async () => {
  mocks.update.mockImplementation(async () => { mocks.auth.currentUser = { uid: 'other' }; });
  await removeAllFinancialData('owner');
  expect(mocks.reset).not.toHaveBeenCalled();
});
