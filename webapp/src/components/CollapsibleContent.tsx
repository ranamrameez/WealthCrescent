import { useState, type ReactNode } from 'react';

/** Flat, lazy disclosure for secondary content inside an existing card. */
export function CollapsibleContent({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{title}</summary>{open && children}</details>;
}
