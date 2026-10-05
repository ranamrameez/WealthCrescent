import { resolveNumericInput } from '../lib/mathExpression';

export type CellValue = string | boolean;
export type RowErrors = Record<string, string | undefined>;
export interface BatchChange<T> { before: T; after: T }
export interface BatchMutations<T> { added: T[]; deleted: T[] }
export interface BatchColumn<T> {
  key: Extract<keyof T, string>;
  label: string;
  width?: number;
  type?: 'text' | 'number' | 'date' | 'time' | 'select' | 'category' | 'boolean' | 'currency' | 'amount';
  editable?: boolean | ((row: T) => boolean);
  formatter?: (value: T[Extract<keyof T, string>], row: T) => string;
  parser?: (value: CellValue, row: T) => T[Extract<keyof T, string>];
  validator?: (row: T) => string | undefined;
  options?: { value: string; label: string }[];
}

export function cellValue<T>(row: T, column: BatchColumn<T>): CellValue {
  return column.type === 'boolean' ? !!row[column.key] : String(row[column.key] ?? '');
}

/** Parse only edited cells; omitted optional fields remain omitted. */
export function parseBatchRow<T>(before: T, cells: Record<string, CellValue>, columns: BatchColumn<T>[]) {
  const after = { ...before };
  const errors: RowErrors = {};
  for (const column of columns) {
    if (!(column.key in cells) || cells[column.key] === cellValue(before, column)) continue;
    const raw = cells[column.key];
    try {
      let value: unknown = raw;
      if (column.parser) value = column.parser(raw, before);
      else if (['number', 'currency', 'amount'].includes(column.type ?? '')) {
        const resolved = resolveNumericInput(String(raw));
        if (resolved === null) throw new Error('Enter a finite number or valid formula.');
        value = resolved;
      }
      after[column.key] = value as T[typeof column.key];
    } catch (error) {
      errors[column.key] = error instanceof Error ? error.message : 'Invalid value.';
    }
  }
  return { after, errors };
}

export function validBatchDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Prepare every replacement before the caller performs a single store write.
 * Conservative record-level conflict detection avoids overwriting cloud edits.
 */
export function prepareBatch<T extends { id: string }>(
  current: T[], changes: BatchChange<T>[], allowed: readonly (keyof T)[],
  validate: (row: T) => RowErrors, locked: (row: T) => string | undefined,
  mutations: BatchMutations<T> = { added: [], deleted: [] },
): T[] {
  const byId = new Map(current.map(row => [row.id, row]));
  const replacements = new Map<string, T>();
  for (const { before, after } of changes) {
    const row = byId.get(before.id);
    if (!row || JSON.stringify(row) !== JSON.stringify(before)) throw new Error(`Record ${before.id} changed or was removed. Discard and reopen to load the latest data.`);
    if (replacements.has(before.id)) throw new Error('Duplicate record in batch.');
    const reason = locked(row);
    if (reason) throw new Error(reason);
    const next = { ...row };
    for (const key of allowed) {
      if (!Object.is(before[key], after[key])) next[key] = after[key];
    }
    const error = Object.values(validate(next)).find(Boolean);
    if (error) throw new Error(`Record ${before.id}: ${error}`);
    replacements.set(row.id, next);
  }
  const deleted = new Set<string>();
  for (const before of mutations.deleted) {
    const row = byId.get(before.id);
    if (!row || JSON.stringify(row) !== JSON.stringify(before)) throw new Error('A deleted record changed. Discard and reopen the editor.');
    if (deleted.has(row.id) || replacements.has(row.id)) throw new Error('Duplicate record in batch.');
    const reason = locked(row);
    if (reason) throw new Error(reason);
    deleted.add(row.id);
  }
  const addedIds = new Set<string>();
  for (const row of mutations.added) {
    if (!row.id || byId.has(row.id) || addedIds.has(row.id)) throw new Error('Duplicate or missing new record ID.');
    const reason = locked(row);
    if (reason) throw new Error(reason);
    const error = Object.values(validate(row)).find(Boolean);
    if (error) throw new Error(error);
    addedIds.add(row.id);
  }
  return [...current.filter(row => !deleted.has(row.id)).map(row => replacements.get(row.id) ?? row), ...mutations.added];
}
