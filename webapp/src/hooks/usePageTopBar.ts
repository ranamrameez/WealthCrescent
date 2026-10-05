import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePageTopBarStore, type TopBarChip } from '../store/pageTopBarStore';

/** Registers this page's own top-bar section chips (see `Tabs.tsx`, the
 * only real caller) into the shared store, so they render in the
 * app-wide fixed `TopBar` instead of scrolling away with the page.
 * Clears on unmount so a stale set of chips never lingers into the next
 * page. Registration re-runs when the visible chip signature changes, while
 * callbacks are dispatched through a ref so callback-only changes do not
 * re-register — `Tabs.tsx` rebuilds its chips from its own local `openKeys`
 * state on every render, which is fine since that state only changes on a real
 * chip click. */
export function usePageTopBarChips(chips: TopBarChip[]): void {
  const setChips = usePageTopBarStore((s) => s.setChips);
  const latestChips = useRef(chips);
  latestChips.current = chips;

  // Parent pages often rebuild their sections/chips arrays while rendering.
  // Registering that fresh array directly in Zustand makes TopBar render,
  // which rebuilds the array again and can recurse until React error #185.
  // Keep the registered array stable while its visible chip state is unchanged,
  // but dispatch clicks through a ref so callbacks are always current.
  const chipSignature = JSON.stringify(chips.map(({ key, label, active }) => [key, label, active]));
  const stableChips = useMemo<TopBarChip[]>(
    () => chips.map(({ key, label, active }) => ({
      key,
      label,
      active,
      onClick: () => latestChips.current.find((chip) => chip.key === key)?.onClick(),
    })),
    // chipSignature contains every value rendered by TopBar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chipSignature],
  );

  useEffect(() => {
    setChips(stableChips);
  }, [setChips, stableChips]);

  useEffect(() => () => setChips([]), [setChips]);
}

/** Registers an optional extra control on the top bar's right edge (e.g.
 * Net Worth's currency switcher) — independent of `usePageTopBarChips`,
 * since a page with a right-slot control doesn't necessarily use `Tabs`
 * at all. Pass `null` (or omit) to clear. */
export function usePageTopBarRightSlot(node: ReactNode | null): void {
  const setRightSlot = usePageTopBarStore((s) => s.setRightSlot);
  useEffect(() => {
    // A landing page rendering a detail child has no slot of its own.
    // It must not clear the child's newly registered filters.
    if (node == null) return;
    setRightSlot(node);
    return () => {
      if (usePageTopBarStore.getState().rightSlot === node) setRightSlot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}
