import { act, renderHook, cleanup } from '@testing-library/react';
import { create } from 'zustand';
import { afterEach, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
const mock = vi.hoisted(() => ({ set: vi.fn(), transaction: vi.fn(), listener: undefined as undefined | ((snapshot: { val: () => unknown }) => void), listeners: new Map<string, (snapshot: { val: () => unknown }) => void>() }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, set: mock.set, runTransaction: mock.transaction,
  onValue: (path: string, listener: typeof mock.listener) => { mock.listener = listener; if (listener) mock.listeners.set(path, listener); return () => { mock.listeners.delete(path); }; } }));
vi.mock('../client', () => ({ db: {}, firebaseReady: true }));
import { useWorkbookCloudSync } from '../useWorkbookCloudSync';
import { beginWorkbookMaintenance } from '../workbookMaintenance';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('invalidates pre-reset queued writes and resumes normal writes after maintenance', async () => {
  vi.useFakeTimers();
  mock.transaction.mockImplementation(async (_ref, update) => {
    expect(update({ entries: [] })).toMatchObject({ entries: ['new-entry'] });
    return { committed: true };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  act(() => store.getState().setWorkbook({ entries: ['queued-old-data'] }));
  const finish = beginWorkbookMaintenance();
  act(() => store.getState().setWorkbook({ entries: [] }));
  act(() => finish({ cash: { entries: [] } }, true));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).not.toHaveBeenCalled();
  act(() => store.getState().setWorkbook({ entries: ['new-entry'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledTimes(1);
});


it('requires confirmed empty storage before explicit cloud initialization', async () => {
  vi.useFakeTimers();
  mock.set.mockResolvedValue(undefined);
  mock.transaction.mockImplementation(async (_ref, update) => {
    const payload = update(null);
    expect(payload).toMatchObject({ entries: ['local'] });
    mock.transaction.mockImplementationOnce(async (_ref, push) => {
      expect(push(payload)).toMatchObject({ entries: ['later'] });
      return { committed: true };
    });
    return { committed: true };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  const { result } = renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  await expect(result.current.uploadLocalToCloud()).rejects.toThrow('confirmed empty');
  act(() => mock.listener?.({ val: () => null }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  act(() => store.getState().setWorkbook({ entries: ['local'] }));
  expect(mock.transaction).not.toHaveBeenCalled();
  await act(async () => { await result.current.uploadLocalToCloud(); });
  expect(mock.transaction).toHaveBeenCalledWith('users/owner/cash', expect.any(Function), { applyLocally: false });
  expect(result.current.cloudEmpty).toBe(false);
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.set).not.toHaveBeenCalled();
  act(() => store.getState().setWorkbook({ entries: ['later'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledTimes(2);
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
  await expect(result.current.uploadLocalToCloud()).rejects.toThrow('Cloud data changed');
  expect(mock.set).not.toHaveBeenCalled();
  expect(store.getState().workbook.entries).toEqual(['local']);
});

it('exposes a workbook owner only after applying that account’s remote data', () => {
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({
    workbook: { entries: ['cached'] }, setWorkbook: workbook => set({ workbook }),
  }));
  const { result, rerender } = renderHook(
    ({ uid }) => useWorkbookCloudSync('cash', store, { uid } as User, () => ({ entries: [] })),
    { initialProps: { uid: 'owner' } },
  );
  expect(result.current.workbookOwner).toBeUndefined();
  act(() => mock.listener?.({ val: () => ({ entries: ['verified'] }) }));
  expect(result.current.workbookOwner).toBe('owner');
  rerender({ uid: 'next-user' });
  expect(result.current.workbookOwner).toBeUndefined();
  act(() => mock.listener?.({ val: () => null }));
  expect(result.current.workbookOwner).toBeUndefined();
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


it('aborts a routine write on an RTDB retry with competing edits and retains the local draft', async () => {
  vi.useFakeTimers();
  const baseline = { entries: ['original'], settings: { b: 2, a: 1 } };
  const remote = { ...baseline, entries: ['server edit'] };
  mock.transaction.mockImplementation(async (_ref, update) => {
    expect(update({ settings: { a: 1, b: 2 }, entries: ['original'] })).toMatchObject({ entries: ['local edit'] });
    expect(update(remote)).toBeUndefined();
    mock.listener?.({ val: () => remote });
    return { committed: false };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  const { result } = renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => baseline }));
  act(() => store.getState().setWorkbook({ entries: ['local edit'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(result.current.status).toContain('Cloud conflict');
  expect(store.getState().workbook.entries).toEqual(['local edit']);
  act(() => store.getState().setWorkbook({ entries: ['continued local edit'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledTimes(1);
  expect(mock.set).not.toHaveBeenCalled();
});

it('serializes routine writes and uses the first committed snapshot for a queued edit', async () => {
  vi.useFakeTimers();
  let complete!: () => void;
  let saved: unknown;
  mock.transaction.mockImplementationOnce((_ref, update) => {
    saved = update({ entries: ['original'] });
    return new Promise(resolve => {
      complete = () => {
        resolve({ committed: true, snapshot: { val: () => saved } });
      };
    });
  }).mockImplementationOnce(async (_ref, update) => {
    expect(update(saved)).toMatchObject({ entries: ['second edit'] });
    return { committed: true };
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  act(() => store.getState().setWorkbook({ entries: ['first edit'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  act(() => store.getState().setWorkbook({ entries: ['second edit'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  expect(store.getState().workbook.entries).toEqual(['second edit']);
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledTimes(2);
  expect(store.getState().workbook.entries).toEqual(['second edit']);
});


it('keeps another module’s unsynced draft and queued save during a partial restore', async () => {
  vi.useFakeTimers();
  const makeStore = () => create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  const qse = makeStore(), bank = makeStore();
  renderHook(() => useWorkbookCloudSync('workbook', qse, { uid: 'owner' } as User, () => ({ entries: [] })));
  renderHook(() => useWorkbookCloudSync('bank', bank, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => {
    mock.listeners.get('users/owner/workbook')?.({ val: () => ({ entries: ['old QSE'] }) });
    mock.listeners.get('users/owner/bank')?.({ val: () => ({ entries: ['old Bank'] }) });
    qse.getState().setWorkbook({ entries: ['queued QSE'] });
    bank.getState().setWorkbook({ entries: ['unsynced Bank'] });
  });
  mock.transaction.mockImplementation(async (path, update) => {
    expect(path).toBe('users/owner/bank');
    const next = update({ entries: ['old Bank'] });
    expect(next).toMatchObject({ entries: ['unsynced Bank'] });
    return { committed: true, snapshot: { val: () => next } };
  });
  let finish!: (snapshots?: Record<string, unknown>, discardLocalChanges?: boolean) => void;
  act(() => { finish = beginWorkbookMaintenance(['workbook']); });
  act(() => mock.listeners.get('users/owner/workbook')?.({ val: () => ({ entries: ['restored QSE'] }) }));
  act(() => finish({ workbook: { entries: ['restored QSE'] } }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(mock.transaction).toHaveBeenCalledOnce();
  expect(qse.getState().workbook.entries).toEqual(['restored QSE']);
  expect(bank.getState().workbook.entries).toEqual(['unsynced Bank']);
});

it('applies a restored snapshot received while an invalidated old write is still finishing', async () => {
  vi.useFakeTimers();
  let retry!: (value: unknown) => unknown;
  let complete!: (result: { committed: boolean }) => void;
  mock.transaction.mockImplementation((_path, update) => {
    retry = update;
    return new Promise(resolve => { complete = resolve; });
  });
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  act(() => store.getState().setWorkbook({ entries: ['old queued edit'] }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(retry({ entries: ['original'] })).toMatchObject({ entries: ['old queued edit'] });
  let finish!: (snapshots?: Record<string, unknown>, discardLocalChanges?: boolean) => void;
  act(() => { finish = beginWorkbookMaintenance(['cash']); });
  expect(retry({ entries: ['original'] })).toBeUndefined();
  act(() => mock.listener?.({ val: () => ({ entries: ['restored'] }) }));
  act(() => finish({ cash: { entries: ['restored'] } }));
  await act(async () => { complete({ committed: false }); });
  expect(store.getState().workbook.entries).toEqual(['restored']);
  expect(mock.transaction).toHaveBeenCalledOnce();
});

it('retains and resumes a selected unsynced draft when restore fails without changing its server base', async () => {
  vi.useFakeTimers();
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  act(() => store.getState().setWorkbook({ entries: ['unsynced draft'] }));
  let finish!: () => void;
  act(() => { finish = beginWorkbookMaintenance(['cash']); });
  act(() => finish());
  mock.transaction.mockImplementation(async (_path, update) => {
    const next = update({ entries: ['original'] });
    expect(next).toMatchObject({ entries: ['unsynced draft'] });
    return { committed: true, snapshot: { val: () => next } };
  });
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(store.getState().workbook.entries).toEqual(['unsynced draft']);
  expect(mock.transaction).toHaveBeenCalledOnce();
});

it('preserves edits entered during restore and exposes a conflict instead of uploading over the restored cloud data', async () => {
  vi.useFakeTimers();
  const store = create<{ workbook: { entries: string[] }; setWorkbook: (wb: { entries: string[] }) => void }>(set => ({ workbook: { entries: [] }, setWorkbook: workbook => set({ workbook }) }));
  const { result } = renderHook(() => useWorkbookCloudSync('cash', store, { uid: 'owner' } as User, () => ({ entries: [] })));
  act(() => mock.listener?.({ val: () => ({ entries: ['original'] }) }));
  let finish!: (snapshots?: Record<string, unknown>) => void;
  act(() => { finish = beginWorkbookMaintenance(['cash']); });
  act(() => store.getState().setWorkbook({ entries: ['new edit during restore'] }));
  act(() => mock.listener?.({ val: () => ({ entries: ['restored'] }) }));
  expect(store.getState().workbook.entries).toEqual(['new edit during restore']);
  act(() => finish({ cash: { entries: ['restored'] } }));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(result.current.status).toContain('newer local edits kept');
  expect(store.getState().workbook.entries).toEqual(['new edit during restore']);
  expect(mock.transaction).not.toHaveBeenCalled();
});
