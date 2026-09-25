import { createEmptyPSXWorkbook } from './defaultPsxWorkbook';
import { createWorkbookStore } from './createWorkbookStore';

export const usePSXWorkbookStore = createWorkbookStore('WealthCrescent_psx_workbook_v1', createEmptyPSXWorkbook);
