import { useEffect } from 'react';
import { create } from 'zustand';
import { onValue, ref } from 'firebase/database';
import { db } from '../../../lib/firebase/client';
import { useAuthState } from '../../../lib/firebase/useAuthState';
import { requestPsxDataset, type PsxReference } from '../../../lib/stockData/psxApi';

export const usePsxReferenceStore = create<{ data: PsxReference | null; error: string; syncing: boolean; saved: boolean }>(() => ({ data: null, error: '', syncing: false, saved: false }));

export async function syncPsxReference() {
  usePsxReferenceStore.setState({ syncing: true, error: '' });
  try {
    await Promise.all(['/sectors', '/stocks', '/screener'].map(requestPsxDataset));
  } catch (error) {
    usePsxReferenceStore.setState({ error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally { usePsxReferenceStore.setState({ syncing: false }); }
}

export function usePsxReferenceSync() {
  const { user, authResolved } = useAuthState();
  useEffect(() => {
    if (!authResolved || !db) return;
    return onValue(ref(db, 'PSX/reference'), snapshot => {
      const saved = snapshot.val() as PsxReference | null;
      if (saved?.sectors && saved.tickerSectors && Array.isArray(saved.symbols)) usePsxReferenceStore.setState({ data: saved, error: '', saved: true });
      else usePsxReferenceStore.setState({ error: 'Sector reference data is awaiting its first scheduled sync.', saved: false });
    }, () => usePsxReferenceStore.setState({ error: 'Shared sector data is unavailable. Using bundled sector information.' }));
  }, [user?.uid, authResolved]);
}

export function usePsxReference() { return { ...usePsxReferenceStore(), sync: syncPsxReference }; }
