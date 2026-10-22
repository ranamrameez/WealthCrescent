import { useState } from 'react';

/** Reset by scope without a follow-up effect/render; clamp to changing result counts. */
export function usePagination(total: number, scope: string, pageSize = 50) {
  const [selection, setSelection] = useState({ scope, page: 0 });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = selection.scope === scope ? Math.min(selection.page, pageCount - 1) : 0;
  return { page, pageCount, setPage: (next: number) => setSelection({ scope, page: Math.max(0, Math.min(next, pageCount - 1)) }) };
}
