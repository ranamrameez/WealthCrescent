import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTablePagination } from '../useTablePagination';

afterEach(cleanup);

function PaginatedRows({ rows }: { rows: number[] }) {
  const page = useTablePagination(rows);
  return <div>
    <ul>{page.rows.map(row => <li key={row}>{row}</li>)}</ul>
    {page.controls}
  </div>;
}

it('paginates the complete supplied row set and resets to page one when the data changes', () => {
  const initial = Array.from({ length: 60 }, (_, index) => index + 1);
  const { rerender } = render(<PaginatedRows rows={initial} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(25);
  expect(screen.getByText('Showing 1–25 of 60')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  expect(screen.getByText('26')).toBeInTheDocument();
  expect(screen.queryByText('1')).not.toBeInTheDocument();
  rerender(<PaginatedRows rows={initial.slice(0, 10)} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(10);
  expect(screen.getByText('Showing 1–10 of 10')).toBeInTheDocument();
});

it('supports selecting 50 and 100 rows per page', () => {
  const rows = Array.from({ length: 120 }, (_, index) => index + 1);
  render(<PaginatedRows rows={rows} />);
  fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '50' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
  expect(screen.getByText('Showing 1–50 of 120')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '100' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(100);
});
