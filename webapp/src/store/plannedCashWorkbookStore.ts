import { createEntryStore } from './createEntryStore';
import { createEmptyPlannedCashWorkbook } from './defaultPlannedCashWorkbook';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { EntryStoreState } from './createEntryStore';
import type { PlannedCashEntry, PlannedCashSettings, PlannedCashWorkbook } from '../types/plannedCash';

type PlannedCashState = Omit<EntryStoreState<PlannedCashSettings, PlannedCashEntry>, 'workbook' | 'setWorkbook'> & {
  workbook: PlannedCashWorkbook;
  setWorkbook: (workbook: PlannedCashWorkbook, options?: { skipPersist?: boolean }) => void;
};

/** Cash's "what if" scenario planner (user request 2026-08-23) — a
 * separate store, own localStorage key/Firebase path, deliberately not
 * bolted onto `cashWorkbookStore.ts`'s existing `CashWorkbook` shape
 * (which only has room for one `entries` array via `createEntryStore`'s
 * generic factory). Keeping it independent means zero migration risk to
 * real users' existing Cash data — same reasoning already used for
 * `interEntityTransfersStore.ts`. */
export const usePlannedCashWorkbookStore = createEntryStore(
  'WealthCrescent_planned_cash_v1',
  createEmptyPlannedCashWorkbook,
) as UseBoundStore<StoreApi<PlannedCashState>>;
