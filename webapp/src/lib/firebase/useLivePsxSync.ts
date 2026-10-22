import { useEffect } from 'react';
import { parsePsxScreener } from '../stockData/livePsx';
import { fetchPsx } from '../stockData/psxApi';
import { usePsxFeed } from '../../features/psx/hooks/useLivePsxWorkbook';
import { useAuthState } from './useAuthState';
import { usePsxReferenceSync } from '../../features/psx/hooks/usePsxReference';

export function useLivePsxSync() {
  usePsxReferenceSync();
  const { user, authResolved } = useAuthState();
  useEffect(() => {
    if (!authResolved) return;
    let disposed = false;
    const refresh = async () => {
      if (!usePsxFeed.getState().updatedAt) usePsxFeed.setState({ loading: true });
      try {
        // Shared client handles memory, persisted fallback, and provider-cache freshness.
        const payload = await fetchPsx('/screener');
        if (disposed) return;
        const previous = usePsxFeed.getState();
        const points = previous.updatedAt === payload.meta.timestamp ? previous.points : parsePsxScreener(payload);
        usePsxFeed.setState({ points, error: payload.stale ? 'Showing cached PSX prices; fresh data is unavailable.' : '', loading: false, updatedAt: payload.meta.timestamp });
      } catch (error) {
        if (!disposed) usePsxFeed.setState({ error: error instanceof Error ? error.message : 'PSX prices are unavailable.', loading: false });
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [user?.uid, authResolved]);
}
