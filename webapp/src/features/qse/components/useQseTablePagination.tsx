import { useTablePagination } from '../../../hooks/useTablePagination';

/** Backward-compatible QSE alias; new pages should use the shared hook. */
export function useQseTablePagination<T>(rows: T[]) {
  return useTablePagination(rows);
}
