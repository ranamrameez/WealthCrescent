import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { currentUser: { uid: 'owner' } as { uid: string } | null }, get: vi.fn(), transaction: vi.fn(), account: {} as Record<string, unknown> | null }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, get: mocks.get, runTransaction: mocks.transaction }));
vi.mock('../../lib/firebase/client', () => ({ auth: mocks.auth, db: {}, firebaseReady: true }));
import { exportFullCloudBackup, restoreReviewedFullBackup, reviewFullBackup } from './fullBackupService';
import { CLOUD_PATH_SUFFIX, CREATE_EMPTY } from './workbookRegistry';
import { workbookSyncPaused } from '../../lib/firebase/workbookMaintenance';
const history = [{ id: 'payment', module: 'cash', planId: 'plan', occurrenceDate: '2026-11-19', createdAt: '2026-11-19T00:00:00Z' }];
function file() {
  return { ...Object.fromEntries(Object.entries(CREATE_EMPTY).map(([key, create]) => [key, create()])), cash: { ...CREATE_EMPTY.cash(), entries: [{ id: 'payment', date: '2026-11-19', currencyCode: 'QAR', amount: 50, isDeposit: false, source: 'manual', isPending: true, planLink: { module: 'cash', planId: 'plan', occurrenceDate: '2026-11-19' } }] },
    bank: CREATE_EMPTY.bank(), plannedCash: { ...CREATE_EMPTY.plannedCash(), entries: [{ id: 'plan', date: '2026-11-19', amount: 50, currencyCode: 'QAR', type: 'OUT' }] },
    plannedBank: CREATE_EMPTY.plannedBank(), interEntityTransfers: CREATE_EMPTY.interEntityTransfers(), paymentExecutions: history };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.currentUser = { uid: 'owner' };
  mocks.account = { cash: { entries: [{ id: 'old' }] }, preferences: { theme: 'dark' }, workbook: { transactions: [{ id: 'trade' }] }, marketData: { private: 'not a workbook' } };
  mocks.get.mockImplementation(async () => { const value = structuredClone(mocks.account); return { val: () => value }; });
  mocks.transaction.mockImplementation(async (_path, update) => {
    if (mocks.account !== null) expect(update(null)).toBeNull();
    const next = update(structuredClone(mocks.account));
    if (next !== undefined) mocks.account = next;
    return { committed: next !== undefined, snapshot: { val: () => structuredClone(mocks.account) } };
  });
});
it('exports one consistent account snapshot including history and QSE alias without preferences or other paths', async () => {
  mocks.account!.paymentExecutions = history;
  const backup = await exportFullCloudBackup('owner');
  expect(mocks.get).toHaveBeenCalledOnce();
  expect(mocks.get).toHaveBeenCalledWith('users/owner');
  expect(backup.qse).toEqual({ transactions: [{ id: 'trade' }] });
  expect(backup.paymentExecutions).toEqual(history);
  expect(backup).not.toHaveProperty('preferences');
  expect(backup).not.toHaveProperty('marketData');
  expect(Object.keys(backup)).toHaveLength(Object.keys(CLOUD_PATH_SUFFIX).length + 2);
  expect(backup._backup).toMatchObject({ version: 2, owner: 'owner', scope: 'cloud' });
});
it('atomically restores pending records, plans, transfer links and history, keeping unrelated account fields', async () => {
  const input = file();
  const preview = await reviewFullBackup('owner', input);
  input.cash.entries[0].amount = 999;
  await restoreReviewedFullBackup(preview);
  expect(mocks.transaction).toHaveBeenCalledWith('users/owner', expect.any(Function), { applyLocally: false });
  expect(mocks.account).toMatchObject({ cash: { entries: [{ amount: 50, isPending: true, planLink: { planId: 'plan' } }] }, plannedCash: { entries: [{ id: 'plan' }] }, paymentExecutions: history, preferences: { theme: 'dark' } });
  expect(workbookSyncPaused()).toBe(false);
  await expect(restoreReviewedFullBackup(preview)).rejects.toThrow(/Review/);
});
it('blocks missing-history legacy payment restores while permitting unrelated legacy modules', async () => {
  mocks.account!.paymentExecutions = history;
  await expect(reviewFullBackup('owner', { cash: CREATE_EMPTY.cash() })).rejects.toThrow(/omits existing payment execution history/);
  const preview = await reviewFullBackup('owner', { qse: CREATE_EMPTY.qse() });
  await restoreReviewedFullBackup(preview);
  expect(mocks.account!.paymentExecutions).toEqual(history);
});
it('keeps legacy backups usable with empty history and recognizes raw RTDB workbook aliases', async () => {
  const preview = await reviewFullBackup('owner', { cash: { settings: { defaultCurrency: 'QAR' } }, workbook: CREATE_EMPTY.qse() });
  expect(preview.modules).toContain('qse');
  await restoreReviewedFullBackup(preview);
  expect(mocks.account).toMatchObject({ cash: { entries: [], settings: { defaultCurrency: 'QAR' } } });
});
it('rejects partial history restores, malformed lists and duplicate execution identities before writes', async () => {
  await expect(reviewFullBackup('owner', { cash: CREATE_EMPTY.cash(), paymentExecutions: history })).rejects.toThrow(/together/);
  await expect(reviewFullBackup('owner', { ...file(), paymentExecutions: [...history, ...history] })).rejects.toThrow(/duplicate/);
  await expect(reviewFullBackup('owner', { cash: { entries: {} } })).rejects.toThrow(/Invalid backup list/);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('aborts when another client changes a restored path or payment history after preview', async () => {
  const preview = await reviewFullBackup('owner', file());
  mocks.account!.paymentExecutions = [{ ...history[0], id: 'concurrent' }];
  const unchanged = structuredClone(mocks.account);
  await expect(restoreReviewedFullBackup(preview)).rejects.toThrow(/changed/);
  expect(mocks.account).toEqual(unchanged);
  expect(workbookSyncPaused()).toBe(false);
});
it('allows unrelated changes during transaction retry without overwriting them', async () => {
  const preview = await reviewFullBackup('owner', file());
  mocks.transaction.mockImplementation(async (_path, update) => {
    const competing = { ...mocks.account, preferences: { theme: 'light' } };
    const next = update(competing);
    mocks.account = next;
    return { committed: true, snapshot: { val: () => next } };
  });
  await restoreReviewedFullBackup(preview);
  expect(mocks.account!.preferences).toEqual({ theme: 'light' });
});
it('denies foreign identities, changed auth during export/restore and unknown preview objects', async () => {
  await expect(exportFullCloudBackup('other')).rejects.toThrow(/sign-in/);
  const preview = await reviewFullBackup('owner', file());
  mocks.auth.currentUser = { uid: 'other' };
  await expect(restoreReviewedFullBackup(preview)).rejects.toThrow(/sign-in/);
  mocks.auth.currentUser = { uid: 'owner' };
  await expect(restoreReviewedFullBackup({ ...preview })).rejects.toThrow(/Review/);
  mocks.get.mockImplementation(async () => { mocks.auth.currentUser = null; return { val: () => mocks.account }; });
  await expect(exportFullCloudBackup('owner')).rejects.toThrow(/account/);
});
it('releases maintenance on database failure without replacing data', async () => {
  const preview = await reviewFullBackup('owner', file());
  const before = structuredClone(mocks.account);
  mocks.transaction.mockRejectedValue(new Error('Permission denied'));
  await expect(restoreReviewedFullBackup(preview)).rejects.toThrow(/Permission denied/);
  expect(mocks.account).toEqual(before);
  expect(workbookSyncPaused()).toBe(false);
});

it('aborts a retry if a restored workbook changed after the first transaction callback', async () => {
  const preview = await reviewFullBackup('owner', file());
  const before = structuredClone(mocks.account);
  mocks.transaction.mockImplementation(async (_path, update) => {
    expect(update(before)).toHaveProperty('paymentExecutions');
    const competing = { ...before, cash: { entries: [{ id: 'concurrent' }] } };
    expect(update(competing)).toBeUndefined();
    mocks.account = competing;
    return { committed: false, snapshot: { val: () => competing } };
  });
  await expect(restoreReviewedFullBackup(preview)).rejects.toThrow(/changed/);
  expect(mocks.account!.cash).toEqual({ entries: [{ id: 'concurrent' }] });
  expect(mocks.account).not.toHaveProperty('paymentExecutions');
  expect(workbookSyncPaused()).toBe(false);
});
it('can deliberately restore an empty account and preserves settled and voided audit records', async () => {
  mocks.account = null;
  const input = { ...file(), paymentExecutions: [
    { ...history[0], settledOn: '2026-11-20' },
    { ...history[0], id: 'voided', voidedAt: '2026-11-20T00:00:00.000Z' },
  ] };
  const preview = await reviewFullBackup('owner', input);
  await restoreReviewedFullBackup(preview);
  expect(mocks.account!.paymentExecutions).toEqual(input.paymentExecutions);
});
it('rejects incomplete cloud metadata, newer formats and malformed native rows', async () => {
  await expect(reviewFullBackup('owner', { cash: CREATE_EMPTY.cash(), _backup: { version: 2, scope: 'cloud' } })).rejects.toThrow(/missing/);
  await expect(reviewFullBackup('owner', { cash: CREATE_EMPTY.cash(), _backup: { version: 3 } })).rejects.toThrow(/newer format/);
  await expect(reviewFullBackup('owner', { cash: { entries: [null] } })).rejects.toThrow(/Invalid backup record/);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
