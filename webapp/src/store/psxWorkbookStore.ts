import { createEmptyPSXWorkbook } from './defaultPsxWorkbook';
import { createWorkbookStore } from './createWorkbookStore';

export const PSX_WORKBOOK_STORAGE_KEY = 'WealthCrescent_psx_workbook_v1';
export const usePSXWorkbookStore = createWorkbookStore(PSX_WORKBOOK_STORAGE_KEY, createEmptyPSXWorkbook);
