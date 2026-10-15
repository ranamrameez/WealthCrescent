import { Suspense, useDeferredValue, useLayoutEffect, type ReactNode } from 'react';
import { Routes, useLocation } from 'react-router-dom';
import { LoadingSurface } from './LoadingSurface';

export function PageContent({ children }: { children: ReactNode }) {
  const location = useLocation();
  const displayedLocation = useDeferredValue(location);
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  // Run after the destination commits, rather than while the old page is
  // still displayed behind the mask. Queries keep section/filter scrolling.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [displayedLocation.pathname]);
  // Query changes select/filter sections in the same page. They must neither
  // remount the page nor cover it with a page-wide loading mask.
  const switchingPage = location.pathname !== displayedLocation.pathname;
  return <LoadingSurface className="page-loading-surface" loadKey={displayedLocation.pathname} pending={switchingPage}>
    <Suspense fallback={<div data-content-pending="true" className="page-content-placeholder" />}>
      <Routes location={displayedLocation}>{children}</Routes>
    </Suspense>
  </LoadingSurface>;
}
