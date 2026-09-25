import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUrlTransactionFilters } from '../useUrlTransactionFilters';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 25, 12)); });
afterEach(() => vi.useRealTimers());

function setup(url = '/bank/account/a1') {
  return renderHook(() => ({ ...useUrlTransactionFilters(), location: useLocation() }), {
    wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
  });
}

it('defaults to the first of this month without an upper date limit', () => {
  const { result } = setup();
  expect(result.current.filters).toMatchObject({ period: 'since-month', fromDate: '2026-09-01', toDate: '' });
  expect(result.current.activeCount).toBe(0);
  expect(new URLSearchParams(result.current.location.search).get('to')).toBe('');
});

it('restores an open-ended URL without replacing the blank end date', () => {
  const { result } = setup('/bank/account/a1?period=custom&from=2026-08-01&to=&section=transactions');
  expect(result.current.filters).toMatchObject({ fromDate: '2026-08-01', toDate: '' });
  act(() => result.current.setFilters({ direction: 'out' }));
  expect(result.current.filters.toDate).toBe('');
  expect(new URLSearchParams(result.current.location.search).get('section')).toBe('transactions');
});

it('preserves explicit end dates and resets to the open-ended default', () => {
  const { result } = setup('/bank/account/a1?period=custom&from=2026-08-01&to=2026-09-25&direction=out');
  expect(result.current.filters.toDate).toBe('2026-09-25');
  act(() => result.current.resetFilters());
  expect(result.current.filters).toMatchObject({ period: 'since-month', fromDate: '2026-09-01', toDate: '', direction: 'all' });
});
