import { createEntryStore } from './createEntryStore';
import { createEmptyNetWorthSnapshotsWorkbook } from './defaultNetWorthSnapshotsWorkbook';

export const useNetWorthSnapshotsWorkbookStore = createEntryStore(
  'WealthCrescent_net_worth_snapshots_v1',
  createEmptyNetWorthSnapshotsWorkbook,
);
