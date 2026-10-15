import { useEffect, useState, type ReactNode } from 'react';

export function AnimatedSection({ open, children }: { open: boolean; children: ReactNode }) {
  const [retained, setRetained] = useState(open);
  if (open && !retained) setRetained(true);
  useEffect(() => {
    if (open) return;
    const timeout = window.setTimeout(() => setRetained(false), 180);
    return () => window.clearTimeout(timeout);
  }, [open]);
  return <div className={`section-transition${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open}>
    <div className="section-transition-content">{(open || retained) && <div className="standard-card-body">{children}</div>}</div>
  </div>;
}
