import { DateValue } from './DateValue';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cellValue, parseBatchRow, type BatchMutations, type BatchChange, type BatchColumn, type CellValue, type RowErrors } from './batchEditModel';
import { FormulaInput } from './ui/FormulaInput';
import { ToggleChip } from './ui/ToggleChip';
import { DateInput } from './ui/Field';
import './BatchEditGrid.css';

export type { BatchMutations, BatchChange, BatchColumn, RowErrors } from './batchEditModel';

export function BatchEditGrid<T>({ title, description, rows, columns, getRowId, getRowDate, validateRow, rowReadOnly, onSave, onClose, createRow, orderKey, addLabel = 'Add row' }: {
  title: string; description?: string; rows: T[]; columns: BatchColumn<T>[];
  getRowId: (row: T) => string;
  getRowDate?: (row: T) => string;
  validateRow?: (row: T) => RowErrors;
  rowReadOnly?: (row: T) => string | undefined;
  createRow?: () => T;
  addLabel?: string;
  orderKey?: Extract<keyof T, string>;
  onSave: (changes: BatchChange<T>[], mutations: BatchMutations<T>) => void | Promise<void>;
  onClose: () => void;
}) {
  // Snapshot once: cloud/store updates must never replace unsaved drafts.
  const [added, setAdded] = useState<T[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [baseline] = useState(() => structuredClone(rows));
  const [drafts, setDrafts] = useState<Record<string, Record<string, CellValue>>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState(50);
  const allRows = [...baseline, ...added].filter(row => !deleted.includes(getRowId(row)));
  if (order.length) allRows.sort((a, b) => order.indexOf(getRowId(a)) - order.indexOf(getRowId(b)));
  const prepared = allRows.map((before, index) => {
    const isNew = added.includes(before);
    const cells = drafts[getRowId(before)] ?? {};
    const dirtyKeys = columns.filter(c => c.key in cells && cells[c.key] !== cellValue(before, c)).map(c => c.key);
    const { after, errors: parseErrors } = parseBatchRow(before, cells, columns);
    const errors: RowErrors = dirtyKeys.length || isNew ? { ...validateRow?.(after), ...parseErrors } : {};
    if (dirtyKeys.length || isNew) for (const c of columns) errors[c.key] ||= c.validator?.(after);
    if (dirtyKeys.length && rowReadOnly?.(before)) errors._row = rowReadOnly(before);
    return { before, after, dirtyKeys, errors, index, isNew };
  });
  const changed = prepared.filter(row => row.dirtyKeys.length);
  const dirtyCount = changed.reduce((sum, row) => sum + row.dirtyKeys.length, 0) + added.length + deleted.length;
  const invalid = prepared.filter(row => Object.values(row.errors).some(Boolean));
  const dirtyColumns = new Set(changed.flatMap(row => row.dirtyKeys));
  // Filter by the original date so editing a date cannot make a row disappear.
  const filtered = prepared.filter(({ before }) => !getRowDate || ((!fromDate || getRowDate(before) >= fromDate) && (!toDate || getRowDate(before) <= toDate)));
  const visible = filtered.slice(0, limit);
  const hiddenChanges = changed.filter(row => !visible.includes(row)).length;
  const applyPeriod = (value: string) => {
    setPeriod(value); setLimit(50);
    if (value === 'all') { setFromDate(''); setToDate(''); }
    if (value === 'month' || value === 'last-month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - (value === 'last-month' ? 1 : 0), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      setFromDate(iso(start)); setToDate(iso(end));
    }
  };
  const close = () => { if (!saving.current) { if (dirtyCount) setDiscard(true); else onClose(); } };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (discard) setDiscard(false); else close(); return; }
    const target = event.target as HTMLElement;
    if (event.key === 'Enter' && target.dataset.cell) {
      event.preventDefault();
      const [r, c] = target.dataset.cell.split(':').map(Number);
      const step = event.shiftKey ? -1 : 1;
      const position = filtered.findIndex(row => row.index === r);
      for (let next = position + step; next >= 0 && next < filtered.length; next += step) {
        const candidate = filtered[next];
        const col = columns[c];
        if (rowReadOnly?.(candidate.before) || col.editable === false || (typeof col.editable === 'function' && !col.editable(candidate.before))) continue;
        if (next >= limit) setLimit(next + 50);
        requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-cell="${candidate.index}:${c}"]`)?.focus());
        break;
      }
    }
    // Native arrows retain text-caret, numeric, date and select behavior.
    if (event.key === 'Tab') {
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []).filter(item => !item.closest('[inert]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (target === first || target === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (target === last || target === dialog.current)) { event.preventDefault(); first?.focus(); }
    }
  };
  const add = () => {
    if (!createRow) return;
    const row = createRow();
    if (orderKey) (row as Record<string, unknown>)[orderKey] = Math.max(Number(row[orderKey]) || 0, Math.max(0, ...prepared.map(item => Number(item.after[orderKey]) || 0)) + 1);
    setAdded(prev => [...prev, row]); setOrder([...allRows.map(getRowId), getRowId(row)]);
    setPeriod('all'); setFromDate(''); setToDate(''); setLimit(allRows.length + 1);
    const firstColumn = columns.findIndex(col => col.editable !== false && (typeof col.editable !== 'function' || col.editable(row)));
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-cell="${allRows.length}:${firstColumn}"]`)?.focus());
  };
  const remove = (row: T) => {
    const id = getRowId(row);
    if (added.includes(row)) setAdded(prev => prev.filter(item => getRowId(item) !== id));
    else setDeleted(prev => [...prev, id]);
    setDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
  };
  const move = (index: number, step: number) => {
    if (!orderKey) return;
    const a = prepared[index], b = prepared[index + step];
    if (!b || getRowDate?.(a.after) !== getRowDate?.(b.after) || rowReadOnly?.(a.before) || rowReadOnly?.(b.before)) return;
    const ids = allRows.map(getRowId); [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    setOrder(ids);
    setDrafts(prev => ({ ...prev,
      [getRowId(a.before)]: { ...prev[getRowId(a.before)], [orderKey]: String(b.after[orderKey] ?? 0) },
      [getRowId(b.before)]: { ...prev[getRowId(b.before)], [orderKey]: String(a.after[orderKey] ?? 0) },
    }));
  };
  const save = async () => {
    if (saving.current || !dirtyCount) return;
    setShowErrors(true);
    setSaveError('');
    if (invalid.length) {
      // Reveal errors hidden by a date filter or the lazy row window.
      setPeriod('all'); setFromDate(''); setToDate('');
      setLimit(Math.max(50, invalid[0].index + 1));
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    saving.current = true; setBusy(true);
    try { await onSave(changed.filter(row => !row.isNew).map(({ before, after }) => ({ before, after })), { added: prepared.filter(row => row.isNew).map(row => row.after), deleted: baseline.filter(row => deleted.includes(getRowId(row))) }); onClose(); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save changes. Your draft is still here.'); }
    finally { saving.current = false; setBusy(false); }
  };

  return createPortal(<div className="batch-edit-overlay">
    <div className="batch-edit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog} onKeyDown={keyDown}>
      <header className="batch-edit-header">
        <div><h2 id={titleId}>{title}</h2><p>{description}</p></div>
        <div className="batch-edit-buttons">
          {createRow && <button className="btn secondary small" disabled={busy || discard} onClick={add} aria-label={addLabel}>+ {addLabel}</button>}
          <button className="btn secondary" disabled={busy} onClick={close}>Cancel / Discard</button>
          <button className="btn" disabled={busy || !dirtyCount || discard} onClick={() => void save()}>{busy ? 'Saving…' : 'Save all changes'}</button>
        </div>
      </header>
      <div className="batch-edit-status" role="status">{allRows.length} rows · {changed.length} changed rows · {changed.reduce((sum, row) => sum + row.dirtyKeys.length, 0)} changed cells{added.length || deleted.length ? ` / ${added.length} added / ${deleted.length} deleted` : ""}{dirtyCount ? ' · Unsaved changes' : ' · No changes'}</div>
      {getRowDate && <div className="batch-edit-filters" inert={busy || discard}>
        <label>Period<select aria-label="Batch date period" value={period} onChange={event => applyPeriod(event.target.value)}><option value="all">All selected rows</option><option value="month">This month</option><option value="last-month">Last month</option><option value="custom">Custom range</option></select></label>
        <label>From<DateInput aria-label="Batch from date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPeriod('custom'); setLimit(50); }} /></label>
        <label>To<DateInput aria-label="Batch to date" value={toDate} onChange={event => { setToDate(event.target.value); setPeriod('custom'); setLimit(50); }} /></label>
        <span>{visible.length} of {filtered.length} matching rows loaded{hiddenChanges ? ` · ${hiddenChanges} changed rows outside this view; Save includes them` : ''}</span>
      </div>}
      <p className="batch-edit-help">Amounts accept formulas, e.g. =5*986.5. Tab / Shift+Tab: next / previous cell. Enter / Shift+Enter: down / up. Escape: review discard. Highlighted headers mark edited columns.</p>
      {discard && <div className="batch-edit-warning" role="alert">
        Discard all unsaved changes?
        <button className="btn secondary small" onClick={() => setDiscard(false)}>Keep editing</button>
        <button className="btn small" onClick={onClose}>Discard changes</button>
      </div>}
      {showErrors && invalid.length > 0 && <div className="batch-edit-warning" role="alert">Fix errors in {invalid.length} changed rows before saving.</div>}
      {saveError && <div className="batch-edit-warning" role="alert">{saveError}</div>}
      <div className="batch-edit-scroll" inert={busy || discard} onScroll={event => {
        const el = event.currentTarget;
        if (el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 160 && limit < filtered.length) setLimit(value => Math.min(value + 50, filtered.length));
      }}>
        <table className="batch-edit-table" style={{ width: 110 + columns.reduce((sum, col) => sum + (col.width ?? 160), 0) }}>
          <colgroup><col style={{ width: 110 }} />{columns.map(c => <col key={c.key} style={{ width: c.width ?? 160 }} />)}</colgroup>
          <thead><tr><th scope="col">Row / status</th>{columns.map(c => <th scope="col" key={c.key} className={dirtyColumns.has(c.key) ? 'batch-edit-column-dirty' : undefined}>{c.label}{dirtyColumns.has(c.key) && <small> Edited</small>}</th>)}</tr></thead>
          <tbody>{visible.map(({ before, after, dirtyKeys, errors, index, isNew }) => {
            const id = getRowId(before), locked = rowReadOnly?.(before);
            return <tr key={id}>
              <th scope="row">{index + 1}
                {isNew && <small>New</small>}
                {!locked && createRow && <div className="batch-edit-row-actions">
                  {orderKey && [-1, 1].map(step => <button key={step} type="button" aria-label={`Move row ${index + 1} ${step < 0 ? 'up' : 'down'}`} disabled={!prepared[index + step] || getRowDate?.(prepared[index + step].after) !== getRowDate?.(prepared[index].after) || !!rowReadOnly?.(prepared[index + step].before)} onClick={() => move(index, step)}>{step < 0 ? '↑' : '↓'}</button>)}
                  <button type="button" aria-label={`Delete row ${index + 1}`} onClick={() => remove(before)}>×</button>
                </div>}{dirtyKeys.length > 0 ? ' · Changed' : ''}{locked && <span className="batch-edit-linked-pill" title={locked}>Read-only</span>}<small>{showErrors && errors._row}</small></th>
              {columns.map((col, ci) => {
                const editable = !locked && col.editable !== false && (typeof col.editable !== 'function' || col.editable(before));
                const value = drafts[id]?.[col.key] ?? cellValue(before, col);
                const error = showErrors ? errors[col.key] : undefined;
                const errorId = `${titleId}-${index}-${ci}`;
                const change = (v: CellValue) => { setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [col.key]: v } })); setSaveError(''); };
                const props = { 'aria-label': `Row ${index + 1}, ${col.label}`, 'aria-invalid': !!error, 'aria-describedby': error ? errorId : undefined, 'data-cell': `${index}:${ci}` };
                return <td key={col.key} className={`${dirtyColumns.has(col.key) ? 'batch-edit-column-changed' : ''} ${isNew || dirtyKeys.includes(col.key) ? 'batch-edit-dirty' : ''} ${error ? 'batch-edit-invalid' : ''}`}>
                  {!editable ? <span className="batch-edit-readonly">{col.formatter ? col.formatter(after[col.key], after) : col.type === 'date' ? <DateValue value={String(after[col.key] ?? '')} /> : col.type === 'boolean' ? (after[col.key] ? 'Yes' : 'No') : col.options?.find(option => option.value === String(after[col.key] ?? ''))?.label ?? String(cellValue(after, col))}</span>
                    : col.type === 'boolean' ? <ToggleChip {...props} label={col.label} checked={!!value} onChange={change} />
                    : col.type === 'select' || col.type === 'category' ? <select {...props} value={String(value)} onChange={e => change(e.target.value)}>
                      {!col.options?.some(o => o.value === String(value)) && <option value={String(value)}>{String(value) || 'Unspecified'}</option>}
                      {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    : ['number', 'currency', 'amount'].includes(col.type ?? '') ? <FormulaInput {...props} value={String(value)} onValueChange={change} />
                    : col.type === 'date' ? <DateInput {...props} value={String(value)} onChange={e=>change(e.target.value)} />
                    : <input {...props} type={col.type === 'time' ? 'time' : 'text'} value={String(value)} onChange={e => change(e.target.value)} />}
                  {error && <small id={errorId} className="batch-edit-error">{error}</small>}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
        {!filtered.length && <p>No rows in this date period.</p>}
        {limit < filtered.length && <button className="btn secondary batch-edit-load" onClick={() => setLimit(value => value + 50)}>Load 50 more rows ({filtered.length - visible.length} remaining)</button>}
      </div>
    </div>
  </div>, document.body);
}
