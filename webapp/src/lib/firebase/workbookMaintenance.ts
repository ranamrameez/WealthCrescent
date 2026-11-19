// Account-root commands invalidate payment work globally; workbook sync can fence
// only the selected paths so partial restores retain unrelated queued drafts.
let epoch = 0;
let allEpoch = 0;
let active = false;
let scope: ReadonlySet<string> | undefined;
const pathEpochs = new Map<string, number>();
export interface WorkbookMaintenanceEvent { phase: 'begin' | 'finish'; snapshots?: Readonly<Record<string, unknown>>; discardLocalChanges?: boolean }
const listeners = new Set<(event: WorkbookMaintenanceEvent) => void>();
export function workbookSyncEpoch() { return epoch; }
export function workbookSyncEpochFor(path: string) { return Math.max(allEpoch, pathEpochs.get(path) ?? 0); }
export function workbookSyncPaused(path?: string) { return active && (path === undefined || scope === undefined || scope.has(path)); }
export function subscribeWorkbookMaintenance(listener: (event: WorkbookMaintenanceEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function changed(paths: ReadonlySet<string> | undefined, event: WorkbookMaintenanceEvent) {
  epoch++;
  if (paths === undefined) allEpoch = epoch;
  else for (const path of paths) pathEpochs.set(path, epoch);
  for (const listener of listeners) {
    try { listener(event); }
    catch (error) { console.warn('Could not refresh a workbook after data maintenance.', error); }
  }
}
export function beginWorkbookMaintenance(paths?: readonly string[]) {
  if (active) throw new Error('Another data operation is already running.');
  const selected = paths === undefined ? undefined : new Set(paths);
  active = true; scope = selected; changed(selected, { phase: 'begin' });
  let finished = false;
  return (snapshots?: Readonly<Record<string, unknown>>, discardLocalChanges = false) => {
    if (finished) return;
    finished = true; active = false; scope = undefined; changed(selected, { phase: 'finish', snapshots, discardLocalChanges });
  };
}
