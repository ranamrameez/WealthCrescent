import { useSearchParams } from 'react-router-dom';

/** Entity detail selection survives refresh, global finder navigation and browser Back. */
export function useUrlEntitySelection<T extends { id: string }>(key: string, items: T[], mutuallyExclusiveKey?: string): [T | null, (item: T | null) => void] {
  const [params, setParams] = useSearchParams();
  const selected = items.find(item => item.id === params.get(key)) ?? null;
  return [selected, item => {
    const next = new URLSearchParams(params);
    if (item) { next.set(key, item.id); if (mutuallyExclusiveKey) next.delete(mutuallyExclusiveKey); }
    else next.delete(key);
    next.delete('section');
    setParams(next);
  }];
}
