import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePageTopBarChips } from '../usePageTopBar';
import { usePageTopBarStore } from '../../store/pageTopBarStore';

beforeEach(() => {
  usePageTopBarStore.setState({ chips: [], rightSlot: null });
});

it('does not rewrite the top-bar store when only chip callback identities change', () => {
  const firstClick = vi.fn();
  const secondClick = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ onClick }) => usePageTopBarChips([{ key: 'summary', label: 'Summary', active: true, onClick }]),
    { initialProps: { onClick: firstClick } },
  );

  const registeredChips = usePageTopBarStore.getState().chips;
  rerender({ onClick: secondClick });

  expect(usePageTopBarStore.getState().chips).toBe(registeredChips);
  act(() => usePageTopBarStore.getState().chips[0]?.onClick());
  expect(firstClick).not.toHaveBeenCalled();
  expect(secondClick).toHaveBeenCalledOnce();

  unmount();
  expect(usePageTopBarStore.getState().chips).toEqual([]);
});
