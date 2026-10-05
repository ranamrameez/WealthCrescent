import { useState, type ReactNode } from 'react';
import { PageFilterModal } from './PageFilterModal';
import { FilterIcon } from './icons';

/** Popup for table-specific filters on pages with several independent tables. */
export function PageFilters({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn secondary small mb-12" onClick={() => setOpen(true)}><FilterIcon size={14} /> Filters</button>
    {open && <PageFilterModal onClose={() => setOpen(false)}>{children}</PageFilterModal>}
  </>;
}
