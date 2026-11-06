import { act, renderHook, cleanup } from '@testing-library/react';
import { create } from 'zustand';
import { afterEach, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
const mock = vi.hoisted(() => ({ set: vi.fn(), listener: undefined as undefined | ((snapshot: { val: () => unknown }) => void) }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, set: mock.set,
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
