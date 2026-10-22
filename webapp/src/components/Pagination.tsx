import { StandardButton } from './standard';

/** Zero-based page controls shared by bounded lists and data tables. */
export function Pagination({ page, pageCount, total, onChange }: { page: number; pageCount: number; total: number; onChange: (page: number) => void }) {
  return <nav className="row gap-sm" aria-label="Pagination"><StandardButton tone="secondary" size="small" disabled={page <= 0} onClick={() => onChange(page - 1)}>Previous</StandardButton><span aria-live="polite">{page + 1} / {Math.max(1, pageCount)} · {total} records</span><StandardButton tone="secondary" size="small" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)}>Next</StandardButton></nav>;
}
