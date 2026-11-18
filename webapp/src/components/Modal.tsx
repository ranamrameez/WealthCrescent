import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CollapseIcon, ExpandIcon } from './icons';
import { createPortal } from 'react-dom';
import { highestOverlayLayer, OverlayLayerContext, useOverlayLayer } from './overlayLayer';

export function Modal({
  title,
  onClose,
  children,
  zIndex,
  width,
  widthClass,
  manageFocus = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Minimum layer; a new popup always clears already open overlays. */
  zIndex?: number;
  /** Overrides `.modal-box`'s default width cap. */
  width?: string;
  widthClass?: '40' | '50' | '60';
  manageFocus?: boolean;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const layer = useOverlayLayer(zIndex ?? 100);
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!manageFocus) return;
    const box = boxRef.current;
    if (!box) return;
    const previous = document.activeElement;
    box.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || highestOverlayLayer() > layer) return;
      const focusable = Array.from(box.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]',
      )).filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      const active = document.activeElement;
      if (!box.contains(active) || active === box || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [manageFocus, layer]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (!event.defaultPrevented && event.key === 'Escape' && highestOverlayLayer() <= layer) { if (fullScreen) setFullScreen(false); else onClose(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullScreen, onClose, layer]);
  return createPortal(<OverlayLayerContext.Provider value={layer}>
    <div className="modal-overlay show" style={{ zIndex: layer }} onClick={onClose}>
      <div
        ref={boxRef}
        role={manageFocus ? 'dialog' : undefined}
        aria-modal={manageFocus || undefined}
        aria-labelledby={manageFocus ? titleId : undefined}
        tabIndex={manageFocus ? -1 : undefined}
        className={`modal-box${fullScreen ? ' fullscreen' : ''}${!fullScreen && widthClass ? ` modal-width-${widthClass}` : ''}`}
        style={!fullScreen && width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header d-flex justify-between align-center">
          <h3 id={titleId} className="m-0">{title}</h3>
          <div className="d-flex align-center" style={{ gap: 4 }}>
            <button
              aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
              title={fullScreen ? 'Exit full screen' : 'Full screen'}
              onClick={() => setFullScreen((v) => !v)}
              className="modal-icon-btn modal-screen-toggle"
            >
              {fullScreen ? <CollapseIcon /> : <ExpandIcon />}
              <span>{fullScreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
            <button aria-label="Close" title="Close" onClick={onClose} className="modal-icon-btn modal-icon-btn-close">
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div></OverlayLayerContext.Provider>, document.body);
}
