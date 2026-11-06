// Invalidates queued writes across every workbook hook during a bulk reset.
let epoch = 0;
let active = false;
export function workbookSyncEpoch() { return epoch; }
export function workbookSyncPaused() { return active; }
export function beginWorkbookMaintenance() {
  if (active) throw new Error('Another data operation is already running.');
  active = true; epoch++;
  return () => { active = false; epoch++; };
}
