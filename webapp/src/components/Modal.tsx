import { useEffect, useState, type ReactNode } from 'react';
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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Minimum layer; a new popup always clears already open overlays. */
  zIndex?: number;
  /** Overrides `.modal-box`'s default width cap. */
  width?: string;
  widthClass?: '40' | '50' | '60';
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const layer = useOverlayLayer(zIndex ?? 100);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (!event.defaultPrevented && event.key === 'Escape' && highestOverlayLayer() <= layer) { if (fullScreen) setFullScreen(false); else onClose(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullScreen, onClose, layer]);
  return createPortal(<OverlayLayerContext.Provider value={layer}>
    <div className="modal-overlay show" style={{ zIndex: layer }} onClick={onClose}>
      <div
        className={`modal-box${fullScreen ? ' fullscreen' : ''}${!fullScreen && widthClass ? ` modal-width-${widthClass}` : ''}`}
        style={!fullScreen && width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header d-flex justify-between align-center">
          <h3 className="m-0">{title}</h3>
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
