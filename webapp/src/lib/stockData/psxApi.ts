import { get, ref, runTransaction, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase/client';
import { PSX_CACHE_MS, psxCacheKey, validPsxPath } from '../../../../functions/psxDataModel.mjs';
export { buildPsxReference } from '../../../../functions/psxDataModel.mjs';
export type { PsxReference, PsxSector, PsxScreenerRow } from '../../../../functions/psxDataModel.mjs';

export interface PsxResponse<T = unknown> {
  data: T;
  meta: { timestamp: string; cached?: boolean; count?: number };
  stale?: boolean;
}
export interface PsxHistoricalRow { date: string; open: number; high: number; low: number; close: number; volume: number; is_anomaly: boolean }
const pending = new Map<string, Promise<PsxResponse>>();
const memory = new Map<string, { at: number; value: PsxResponse }>();

export async function requestPsxDataset(path: string) {
  if (!db || !auth?.currentUser) throw new Error('Sign in to request this dataset.');
  await runTransaction(ref(db, 'PSX/requests/' + psxCacheKey(path)), current => current ? undefined : { path, requestedAt: serverTimestamp() }, { applyLocally: false });
}

/** Reads only our shared Firebase cache. The scheduled worker owns provider access. */
export function fetchPsx<T = unknown>(path: string, ttl = PSX_CACHE_MS): Promise<PsxResponse<T>> {
  if (!validPsxPath(path)) return Promise.reject(new Error('Unsupported PSX dataset.'));
  const id = psxCacheKey(path), key = 'psx-api:' + path;
  let saved = memory.get(key);
  if (!saved) try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value?.value?.meta?.timestamp && 'data' in value.value && Number.isFinite(value.at)) saved = value;
  } catch { /* optional cache */ }
  if (saved && Date.now() - saved.at < ttl) return Promise.resolve(saved.value as PsxResponse<T>);
  const existing = pending.get(path);
  if (existing) return existing as Promise<PsxResponse<T>>;
  const fallback = saved;
  const request = (async (): Promise<PsxResponse> => {
    try {
      if (!db) throw new Error('Market data storage is unavailable.');
      const snapshot = await get(ref(db, 'PSX/api/' + id));
      const entry = snapshot.val();
      if (!entry?.payload) {
        if (auth?.currentUser) await requestPsxDataset(path);
        throw new Error(auth?.currentUser ? 'Dataset requested. It will appear after the next scheduled refresh (up to 15 minutes).' : 'This dataset has not been cached yet. Sign in to request it.');
      }
      const value: PsxResponse = JSON.parse(entry.payload);
      if (!value || !('data' in value) || !Number.isFinite(Date.parse(value.meta?.timestamp)) || !Number.isFinite(entry.fetchedAt)) throw new Error('Invalid cached market data.');
      value.stale = !!value.stale || Date.now() - entry.fetchedAt > ttl;
      const stored = { at: value.stale ? 0 : entry.fetchedAt, value };
      memory.set(key, stored);
      try { localStorage.setItem(key, JSON.stringify(stored)); } catch { /* memory cache remains */ }
      if (value.stale && auth?.currentUser) void requestPsxDataset(path).catch(() => { /* cached data remains usable */ });
      return value;
    } catch (error) {
      if (fallback) return { ...fallback.value, stale: true };
      if (/permission.denied/i.test(String(error))) throw new Error('Shared PSX market data is not accessible yet. Market sync access must be enabled.');
      throw error;
    }
  })().finally(() => pending.delete(path));
  pending.set(path, request);
  return request as Promise<PsxResponse<T>>;
}
