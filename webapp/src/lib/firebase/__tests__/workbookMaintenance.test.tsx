import { act, renderHook, cleanup } from '@testing-library/react';
import { create } from 'zustand';
import { afterEach, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
const mock = vi.hoisted(() => ({ set: vi.fn(), transaction: vi.fn(), listener: undefined as undefined | ((snapshot: { val: () => unknown }) => void) }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, set: mock.set, runTransaction: mock.transaction,
  onValue: (_ref: unknown, listener: typeof mock.listener) => { mock.listener = listener; return () => {}; } }));
vi.mock('../client', () => ({ db: {}, firebaseReady: true }));
import { useWorkbookCloudSync } from '../useWorkbookCloudSync';
import { beginWorkbookMaintenance } from '../workbookMaintenance';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('invalidates pre-reset queued writes and resumes normal writes after maintenance', async () => {
  vi.useFakeTimers(); mock.set.mockResolvedValue(undefined);
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  act(() => store.getState().setWorkbook({ entries: ['queued-old-data'] }));
  const finish = beginWorkbookMaintenance();
  act(() => store.getState().setWorkbook({ entries: [] }));
  finish();
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.set).not.toHaveBeenCalled();
  act(() => store.getState().setWorkbook({ entries: ['new-entry'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.set).toHaveBeenCalledWith('users/owner/cash', expect.objectContaining({ entries: ['new-entry'] }));
});


it('requires confirmed empty storage before explicit cloud initialization', async () => {
  vi.useFakeTimers();
  mock.set.mockResolvedValue(undefined);
  mock.transaction.mockImplementation(async (_ref, update) => {
    expect(update(null)).toMatchObject({ entries: ['local'] });
    return { committed: true };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  const { result } = renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  await expect(result.current.uploadLocalToCloud()).rejects.toThrow('confirmed empty');
  act(() => mock.listener?.({ val: () => null }));
  act(() => store.getState().setWorkbook({ entries: ['local'] }));
  expect(mock.transaction).not.toHaveBeenCalled();
  await act(async () => { await result.current.uploadLocalToCloud(); });
  expect(mock.transaction).toHaveBeenCalledWith('users/owner/cash', expect.any(Function), { applyLocally: false });
  expect(result.current.cloudEmpty).toBe(false);
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.set).not.toHaveBeenCalled();
  act(() => store.getState().setWorkbook({ entries: ['later'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.set).toHaveBeenCalledWith('users/owner/cash', expect.objectContaining({ entries: ['later'] }));
});

it('aborts initialization when a second client creates its workbook first', async () => {
  mock.transaction.mockImplementation(async (_ref, update) => {
    expect(update(null)).toMatchObject({ entries: ['local'] });
    expect(update({ entries: ['remote'] })).toBeUndefined();
    return { committed: false };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: ['local'] }, setWorkbook: workbook => set({ workbook }) }));
  const { result } = renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => null }));
  await expect(result.current.uploadLocalToCloud()).rejects.toThrow('Cloud data was created');
  expect(mock.set).not.toHaveBeenCalled();
  expect(store.getState().workbook.entries).toEqual(['local']);
});

it('invalidates a pending initialization when the signed-in account changes', async () => {
  let retry: ((current: unknown) => unknown) | undefined;
  let finish: ((value: { committed: boolean }) => void) | undefined;
  mock.transaction.mockImplementation((_ref, update) => {
    retry = update;
    return new Promise(resolve => { finish = resolve; });
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: ['local'] }, setWorkbook: workbook => set({ workbook }) }));
  const { result, rerender } = renderHook(
    ({ uid }) => useWorkbookCloudSync('cash', store, { uid } as User, () => ({ entries: [] })),
    { initialProps: { uid: 'owner' } },
  );
  act(() => mock.listener?.({ val: () => null }));
  const startUpload = result.current.uploadLocalToCloud;
  const upload = startUpload();
  expect(retry?.(null)).toMatchObject({ entries: ['local'] });
  rerender({ uid: 'next-user' });
  expect(retry?.(null)).toBeUndefined();
  finish?.({ committed: false });
  await expect(upload).rejects.toThrow('active account or workbook changed');
  expect(result.current.cloudEmpty).toBe(false);
  act(() => mock.listener?.({ val: () => null }));
  await expect(startUpload()).rejects.toThrow('active account changed');
  expect(mock.transaction).toHaveBeenCalledTimes(1);
});
