import { useState } from 'react';
import { Field, Select } from '../components/ui/Field';
import { StandardButton } from '../components/standard';
import { ArrowLeftIcon, ArrowRightIcon } from '../components/icons';

/** Shared table pagination. Pass the complete filtered/sorted row set; the
 * returned rows are only the current page, while callers keep exports and
 * calculations on the complete input set. A changed row signature resets
 * the visible page to the first page. */
export function useTablePagination<T>(rows: T[], initialPageSize = 25) {
  const signature = JSON.stringify(rows);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [state, setState] = useState({ signature, page: 1 });
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(state.signature === signature ? state.page : 1, pageCount);
  const controls = <div className="pagination-bar">
    <div className="text-muted">{rows.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)} of ${rows.length}` : 'No rows'}</div>
    <div className="pagination-actions">
      <span className="text-muted">Page {page} of {pageCount}</span>
      <Field label="Rows" width={78}><Select value={String(pageSize)} onChange={event => { setPageSize(Number(event.target.value)); setState({ signature, page: 1 }); }}><option value="25">25</option><option value="50">50</option><option value="100">100</option></Select></Field>
      <div className="d-flex justify-content-center">
        <StandardButton tone="secondary" size="small" icon={<ArrowLeftIcon />} disabled={page <= 1} onClick={() => setState({ signature, page: page - 1 })}>Previous</StandardButton>
        <StandardButton tone="secondary" size="small" icon={<ArrowRightIcon />} disabled={page >= pageCount} onClick={() => setState({ signature, page: page + 1 })}>Next</StandardButton>
      </div>
    </div>
  </div>;
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), controls, page, pageSize, pageCount };
}
