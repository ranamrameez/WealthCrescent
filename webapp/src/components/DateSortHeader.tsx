import { useContext, useEffect, type ReactNode } from 'react';
import { TableSortContext, type DateSortSelection } from './tableSortContext';
import { SortIcon } from './icons';

export function DateSortHeader({ id, column, selection, setSelection, children, rows }: {
  id: string; column: string; selection: DateSortSelection; setSelection: (selection: DateSortSelection) => void; children: ReactNode; rows?: readonly unknown[];
}) {
  const context = useContext(TableSortContext);
  // Register the complete dataset, before any pagination, for the card actions.
  useEffect(() => { if (rows) context?.register(id, rows, true); });
  const direction = selection?.column === column ? selection.direction : undefined;
  const toggle = () => setSelection({ column, direction: direction === 'desc' ? 'asc' : 'desc' });
  return <th className="sortable" tabIndex={0} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'} onClick={toggle} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }}>{children}<SortIcon direction={direction} /></th>;
}
