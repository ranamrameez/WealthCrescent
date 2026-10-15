import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QseFilterProvider } from '../QseFilters';
import { useQseFilters, matchesQseFilters } from '../qseFilterModel';
import { usePageTopBarStore } from '../../../../store/pageTopBarStore';
afterEach(cleanup);
function Controls() { const control = usePageTopBarStore(state => state.rightSlot); return <>{control}</>; }
function Records() { const filters = useQseFilters(); return <>{[{ date: '2026-10-01', ticker: 'QNBK' }, { date: '2026-10-03', ticker: 'QIBK' }].filter(row => matchesQseFilters(row, filters)).map(row => <p key={row.ticker}>{row.ticker} record</p>)}</>; }
it('registers central filters, applies URL state, and resets all fields', () => {
  render(<MemoryRouter initialEntries={['/transactions?qse-ticker=QNBK']}><Controls /><QseFilterProvider tickers={['QNBK', 'QIBK']}><Records /></QseFilterProvider></MemoryRouter>);
  expect(screen.getByText('QNBK record')).toBeVisible();
  expect(screen.queryByText('QIBK record')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Filters (1)' }));
  fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'QIBK' } });
  expect(screen.getByText('QIBK record')).toBeVisible();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-04' } });
  expect(screen.queryByText('QIBK record')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByText('QNBK record')).toBeVisible();
  expect(screen.getByText('QIBK record')).toBeVisible();
});
