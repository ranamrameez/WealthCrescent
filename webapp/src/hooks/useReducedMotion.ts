import { useSyncExternalStore } from 'react';

let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();
function query() {
  if (!media && typeof matchMedia === 'function') media = matchMedia('(prefers-reduced-motion: reduce)');
  return media;
}
const changed = () => listeners.forEach(listener => listener());
function subscribe(listener: () => void) {
  if (!listeners.size) query()?.addEventListener('change', changed);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) media?.removeEventListener('change', changed); };
}
/** One media-query listener shared by every mounted chart. */
export function useReducedMotion() { return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false); }
