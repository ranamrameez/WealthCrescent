import type { ReactNode } from 'react';

export function PageHeading({ back, children }: { back: ReactNode; children: ReactNode }) {
  return <div className="page-heading">{back}<div className="page-heading-content">{children}</div></div>;
}
