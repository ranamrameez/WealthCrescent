import { createContext } from 'react';
export type DateSortSelection = { column: string; direction: 'asc' | 'desc' } | null;
export interface TableCardDateSort {
  selection: DateSortSelection;
  setSelection: (selection: DateSortSelection) => void;
}
export interface TableSortController {
  selection: DateSortSelection;
  setSelection: (selection: DateSortSelection) => void;
  register: (id: string, rows: readonly unknown[], hasDate: boolean) => void;
  unregister: (id: string) => void;
}
export const TableSortContext = createContext<TableSortController | null>(null);
