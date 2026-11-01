import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TableCard } from '../TableCard';
import { useDateTableSort } from '../../hooks/useDateTableSort';
import { useSortableRows } from '../../hooks/useSortableRows';

const records = [{ id: 'late', date: '2026-10-03', seq: 2, balance: 30 }, { id: 'early', date: '2026-10-01', seq: 1, balance: 10 }, { id: 'tie', date: '2026-10-03', seq: 3, balance: 40 }];
afterEach(cleanup);
function DateRows() {
  const sort = useDateTableSort();
  const rows = sort.rows(records, { date: row => row });
  return <table><thead><tr><sort.Th rows={records}>Date</sort.Th><th>Balance</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.balance}</td></tr>)}</tbody></table>;
}
function ids(container: HTMLElement) { return [...container.querySelectorAll('tbody tr')].map(row => row.firstElementChild?.textContent); }
it('provides standard actions, preserves supplied handlers, and sorts dates without recalculating balances', () => {
  const modify = vi.fn();
  const { container } = render(<TableCard title="Ledger" actions={[{ label: 'Modify', onClick: modify }]}><DateRows /></TableCard>);
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  const menu = screen.getByRole('menu');
  expect(within(menu).queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  expect(within(menu).getByRole('button', { name: 'Export filtered' })).toBeVisible();
  expect(within(menu).queryByRole('button', { name: 'Export all' })).not.toBeInTheDocument();
  expect(within(menu).queryByRole('button', { name: 'Batch edit' })).not.toBeInTheDocument();
  expect(within(menu).getByRole('button', { name: 'Modify' })).toBeVisible();
  fireEvent.click(within(menu).getByRole('button', { name: 'Modify' }));
  expect(modify).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('columnheader', { name: 'Date' }));
  expect(ids(container)).toEqual(['tie', 'late', 'early']);
  fireEvent.keyDown(screen.getByRole('columnheader', { name: 'Date' }), { key: 'Enter' });
  expect(ids(container)).toEqual(['early', 'late', 'tie']);
  expect(container.querySelector('tbody tr')?.textContent).toBe('early10');
  expect(records[0].balance).toBe(30);
});
it('lets header actions sort a child table using the existing sortable-row hook', () => {
  function ExistingTable() {
    const { sorted, Th } = useSortableRows(records, (row, _column: 'date') => row.date, 'date');
    return <table><thead><tr><Th col="date">Date</Th></tr></thead><tbody>{sorted.map(row => <tr key={row.id}><td>{row.id}</td></tr>)}</tbody></table>;
  }
  const { container } = render(<TableCard title="History"><ExistingTable /></TableCard>);
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Date: oldest first' }));
  expect(ids(container)).toEqual(['early', 'late', 'tie']);
  expect(screen.getByRole('columnheader', { name: 'Date' })).toHaveAttribute('aria-sort', 'ascending');
});
