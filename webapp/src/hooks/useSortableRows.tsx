import { useContext, useEffect, useId, useState } from 'react';
import { SortIcon } from '../components/icons';
import { TableSortContext, type TableCardDateSort } from '../components/tableSortContext';

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Click-to-sort table headers, extracted from the Portfolio "Holdings"
 * table so every other table in the app can have the same sortable-header
 * behavior instead of static headers.
 *
 * `tiebreak` (user-reported 2026-09-06, Banking's account statement:
 * "multiple entries at the same time are a disaster, incorrect balance
 * calculations") — a real, confirmed bug, not a display preference: when
 * two rows share the same primary sort value (e.g. two transactions on
 * the same calendar date), `Array.prototype.sort`'s stability keeps their
 * ORIGINAL array order regardless of `sort.dir` — so a table sorted
 * "newest first" (`desc`) still showed a same-date tie in its underlying
 * ASCENDING-chronological array order, i.e. the chronologically EARLIER
 * of the two on top of the LATER one, backwards from the rest of the
 * column. The Balance column itself (computed by `accountRunningLedger`,
 * which already sorts by real instant then `serialNumber`) was never
 * wrong — only this table's own display order disagreed with it, which
 * reads exactly like "the balance calculation is wrong" to a user relying
 * on top-to-bottom = newest-to-oldest. Fixed generically: an optional
 * `tiebreak` returns an ordered composite key (evaluated left-to-right
 * until a difference is found — NOT summed/scaled into one float, which
 * would risk precision loss combining a millisecond epoch value with a
 * small integer tiebreaker) applied, and flipped by `sort.dir` exactly
 * like the primary column, whenever the primary comparison ties. Optional
 * and additive — every existing call site that doesn't pass it keeps its
 * exact previous (stable, array-order) tie behavior. */
export function useSortableRows<T, C extends string>(
  rows: T[],
  sortValue: (row: T, col: C) => number | string,
  initialCol: NoInfer<C>,
  initialDir: 'asc' | 'desc' = 'desc',
  tiebreak?: (row: T) => number[],
) {
  const [localSort, setSort] = useState<{ col: C; dir: 'asc' | 'desc' }>({ col: initialCol, dir: initialDir });

  const context = useContext(TableSortContext);
  const id = useId();
  const dateColumn = /date/i.test(initialCol) || initialCol === 'last';
  const sort = context?.selection && dateColumn ? { col: initialCol, dir: context.selection.direction } : localSort;
  useEffect(() => { context?.register(id, rows, dateColumn); });
  const unregister = context?.unregister;
  useEffect(() => () => unregister?.(id), [unregister, id]);
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a, sort.col);
    const bv = sortValue(b, sort.col);
    let cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    if (cmp === 0 && tiebreak) cmp = compareKeys(tiebreak(a), tiebreak(b));
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (col: C) => {
    context?.setSelection(null);
    setSort({ col, dir: sort.col === col && sort.dir === 'desc' ? 'asc' : 'desc' });
  };
  const Th = ({ col, children }: { col: C; children: React.ReactNode }) => (
    <th className="sortable" tabIndex={0} aria-sort={sort.col === col ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'} onClick={() => toggleSort(col)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSort(col); } }}>
      {children}<SortIcon direction={sort.col === col ? sort.dir : undefined} />
    </th>
  );

  const dateSort: TableCardDateSort | undefined = dateColumn ? {
    selection: sort.col === initialCol ? { column: 'date', direction: sort.dir } : null,
    setSelection: selection => { context?.setSelection(null); if (selection) setSort({ col: initialCol, dir: selection.direction }); },
  } : undefined;
  return { sorted, sort, toggleSort, Th, dateSort };
}
