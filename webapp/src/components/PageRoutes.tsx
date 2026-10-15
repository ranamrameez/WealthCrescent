import { useDeferredValue, type ReactNode } from 'react';
import { Routes, useLocation } from 'react-router-dom';

/** Keep the shell responsive while React prepares the destination page. */
export function PageRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const displayedLocation = useDeferredValue(location);
  const pending = location !== displayedLocation;
  return <>
    {pending && <div className="page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading page…</div>}
    <div className="page-route-content" aria-busy={pending}>
      <div key={displayedLocation.key} className="page-route-enter"><Routes location={displayedLocation}>{children}</Routes></div>
    </div>
  </>;
}
