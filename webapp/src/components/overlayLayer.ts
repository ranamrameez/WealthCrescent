import { createContext, useContext, useState } from 'react';

export const OverlayLayerContext = createContext(0);

/** Inspect open overlays and their stacking ancestors, including fullscreen cards. */
export function highestOverlayLayer(): number {
  if (typeof document === 'undefined') return 0;
  let highest = 0;
  document.querySelectorAll('.modal-overlay.show, .batch-edit-overlay, .standard-card-fullscreen, [role="dialog"], [aria-modal="true"]').forEach(node => {
    for (let element: Element | null = node; element && element !== document.body; element = element.parentElement) {
      const layer = Number.parseInt(getComputedStyle(element).zIndex, 10);
      if (Number.isFinite(layer)) highest = Math.max(highest, layer);
    }
  });
  return highest;
}

/** Reserve a layer once when an overlay opens; rerenders must not escalate it. */
export function useOverlayLayer(minimum: number): number {
  const parent = useContext(OverlayLayerContext);
  const [layer] = useState(() => Math.max(minimum, parent + 10, highestOverlayLayer() + 10));
  return layer;
}
