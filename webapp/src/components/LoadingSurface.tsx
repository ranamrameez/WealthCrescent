import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A paint-only mask: never resizes, translates, or remounts its content. */
export function LoadingSurface({ children, className = '', loadKey = '', pending = false }: {
  children: ReactNode; className?: string; loadKey?: string; pending?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [readiness, setReadiness] = useState({ key: loadKey, ready: false });
  if (readiness.key !== loadKey) setReadiness({ key: loadKey, ready: false });
  const loading = pending || readiness.key !== loadKey || !readiness.ready;
  const sections = useRef<HTMLDivElement>(null);
  const [sectionCount, setSectionCount] = useState(1);
  useLayoutEffect(() => {
    if (!loading || !sections.current) return;
    const element = sections.current;
    const resize = () => setSectionCount(previous => {
      const count = Math.max(1, Math.ceil(element.clientHeight / 620));
      return previous === count ? previous : count;
    });
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (pending || !root.current) return;
    const element = root.current;
    let cancelled = false;
    let firstFrame = 0;
    let paintFrame = 0;
    let fontsReady = !document.fonts || document.fonts.status === 'loaded';
    const check = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(paintFrame);
      if (cancelled || !fontsReady) return;
      // Async children can advertise their readiness without coupling this
      // component to any module's fetch implementation. Lazy images outside
      // the viewport must not hold an otherwise ready page behind a mask.
      if (element.querySelector('[aria-busy="true"], [data-content-pending="true"]')) return;
      if ([...element.querySelectorAll('img')].some(img => img.loading !== 'lazy' && !img.complete)) return;
      firstFrame = requestAnimationFrame(() => {
        paintFrame = requestAnimationFrame(() => {
          if (!cancelled) setReadiness({ key: loadKey, ready: true });
        });
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'data-content-pending', 'src', 'srcset'] });
    element.addEventListener('load', check, true);
    element.addEventListener('error', check, true);
    if (!fontsReady) void document.fonts.ready.then(() => { fontsReady = true; check(); });
    check();
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(paintFrame);
      observer.disconnect();
      element.removeEventListener('load', check, true);
      element.removeEventListener('error', check, true);
    };
  }, [loadKey, pending]);

  return <div ref={root} className={`content-load-surface ${className}`.trim()} aria-busy={loading}>
    {children}
    <div className={`content-load-mask${loading ? ' is-loading' : ''}`} aria-hidden={!loading}>
      {loading && <span className="sr-only" role="status">Loading content…</span>}
      <div className="content-load-skeleton" aria-hidden="true">
        <div className="content-load-heading"><i className="content-load-block" /><i className="content-load-block" /></div>
        <div className="content-load-metrics">{Array.from({ length: 4 }, (_, index) => <i key={index} className="content-load-block" />)}</div>
        <div className="content-load-sections" ref={sections}>{Array.from({ length: sectionCount }, (_, index) =>
          <div key={index} className="content-load-section">
            <i className="content-load-block content-load-section-title" />
            <div className="content-load-section-stats">{Array.from({ length: 3 }, (_, stat) =>
              <div key={stat} className="content-load-mini-card">
                <i className="content-load-block content-load-mini-label" />
                <i className="content-load-block content-load-mini-value" />
              </div>,
            )}</div>
            <div className="content-load-section-panel">
            <i className="content-load-block content-load-section-line" />
            <i className="content-load-block content-load-section-line-short" />
            </div>
          </div>,
        )}</div>
      </div>
    </div>
  </div>;
}
