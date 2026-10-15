import type { TableCardDateSort } from '../../../components/tableSortContext';
import { TableCard } from '../../../components/TableCard';
import type { SectionCardProps } from '../../../components/StandardPageSections';
import { IconButton } from '../../../components/ui/IconButton';
import { XIcon } from '../../../components/icons';
import { propagateLinkedEdit, resolveLinkedEdit } from '../../../lib/linkCascade';
import { ReorderButtons } from '../../../components/ui/ReorderButtons';
import { toInstantMs } from '../../../lib/datetime';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { BatchEditGrid, type BatchColumn } from '../../../components/BatchEditGrid';
import { validBatchDate, prepareBatch } from '../../../components/batchEditModel';
import { CardActionMenu, SummaryChip, type StandardCardAction } from '../../../components/StandardCard';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import { parseCSV, toCSV } from '../../../lib/csv';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useInterEntityTransfersStore } from '../../../store/interEntityTransfersStore';
import type { Transaction, Transfer, Adjustment, Dividend } from '../../../types/workbook';

type Kind = 'ledger' | 'transactions' | 'transfers' | 'adjustments' | 'dividends';
export type QseRow = { id: string; kind?: 'trade' | 'transfer' | 'adjustment'; seq?: number; date: string; time?: string; timezone?: string; ticker?: string; action?: string; shares?: number; price?: number; gross?: number; fee?: number; type?: string; description?: string; amount?: number; note?: string; perShare?: number; isPending?: boolean };
type Row = QseRow;
const column = (key: keyof Row, label: string, type: BatchColumn<Row>['type'] = 'text'): BatchColumn<Row> => ({ key, label, type });
function qseColumns(kind: Kind): BatchColumn<Row>[] {
  const common = [{ ...column('seq', '#', 'number'), editable: false }, column('date', 'Date', 'date'), column('time', 'Time', 'time'), column('timezone', 'Timezone')];
  if (kind === 'ledger') {
    const specific = (source: Exclude<Kind, 'ledger' | 'dividends'>, recordKind: Row['kind']) => qseColumns(source).filter(c => !common.some(shared => shared.key === c.key)).map(c => ({ ...c, label: c.key === 'type' ? 'Transfer type' : c.label, editable: (row: Row) => row.kind === recordKind }));
    return [...common, { ...column('kind', 'Type'), editable: false }, ...specific('transactions', 'trade'), ...specific('transfers', 'transfer'), ...specific('adjustments', 'adjustment')];
  }
  if (kind === 'transactions') return [...common, { ...column('ticker', 'Ticker'), parser: value => String(value).trim().toUpperCase() }, { ...column('action', 'Action', 'select'), options: ['BUY', 'SELL'].map(value => ({ value, label: value })) }, column('shares', 'Shares', 'number'), column('price', 'Price', 'number'), column('isPending', 'Pending', 'boolean')];
  if (kind === 'transfers') return [...common, { ...column('type', 'Type', 'select'), options: ['DEPOSIT', 'WITHDRAWAL'].map(value => ({ value, label: value })) }, column('gross', 'Gross', 'number'), column('fee', 'Fee', 'number'), column('description', 'Description')];
  if (kind === 'dividends') return [...common, column('ticker', 'Ticker'), column('perShare', 'Per share', 'number'), column('shares', 'Shares', 'number'), column('amount', 'Amount', 'number')];
  return [...common, column('amount', 'Amount', 'number'), column('note', 'Note')];
}
function validateQseRow(kind: Kind, row: Row): Record<string, string> {
  if (kind === 'ledger') {
    if (!row.kind || !['trade', 'transfer', 'adjustment'].includes(row.kind)) return { kind: 'Choose trade, transfer or adjustment in the CSV Type column.' };
    return validateQseRow(row.kind === 'trade' ? 'transactions' : row.kind === 'transfer' ? 'transfers' : 'adjustments', row);
  }
  const errors: Record<string, string> = {};
  if (!validBatchDate(row.date)) errors.date = 'Enter a valid date.';
  if (row.time && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(row.time)) errors.time = 'Enter a valid time.';
  if (row.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: row.timezone }); } catch { errors.timezone = 'Enter a valid IANA timezone.'; } }
  for (const c of qseColumns(kind)) if (c.type === 'number' && c.key !== 'seq' && (!Number.isFinite(row[c.key]) || Number(row[c.key]) < 0 && !(kind === 'adjustments' && c.key === 'amount'))) errors[c.key] = 'Enter a valid amount.';
  if ((kind === 'transactions' || kind === 'dividends') && !row.ticker?.trim()) errors.ticker = 'Ticker is required.';
  if (kind === 'transactions') { if (!['BUY', 'SELL'].includes(row.action || '')) errors.action = 'Choose BUY or SELL.'; if (!(row.shares! > 0)) errors.shares = 'Shares must be positive.'; if (!(row.price! > 0)) errors.price = 'Price must be positive.'; }
  if (kind === 'transfers') { if (!['DEPOSIT', 'WITHDRAWAL'].includes(row.type || '')) errors.type = 'Choose DEPOSIT or WITHDRAWAL.'; if (!(row.gross! > 0)) errors.gross = 'Gross must be positive.'; }
  if ((kind === 'adjustments' || kind === 'dividends') && !row.amount) errors.amount = 'Amount must be nonzero.';
  return errors;
}
function download(name: string, header: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCSV([header, ...rows.map(row => row.map(value => value == null ? '' : String(value)))])], { type: 'text/csv' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
export function QseExportActions<T extends object>({ name, rows, allRows, actions = [], title, children }: { actions?: StandardCardAction[]; name: string; rows: T[]; allRows: T[]; title?: ReactNode; children?: ReactNode }) {
  const keys = [...new Set(allRows.flatMap(row => Object.keys(row)))];
  const exportRows = (items: T[], scope: string) => download(`qse-${name}-${scope}`, keys, items.map(row => keys.map(key => (row as Record<string, unknown>)[key])));
  const menu = [{ label: 'Export filtered', onClick: () => exportRows(rows, 'filtered'), disabled: !rows.length }, { label: 'Export all', onClick: () => exportRows(allRows, 'all'), disabled: !allRows.length }, ...actions];
  return title ? <TableCard rows={rows} allRows={allRows} title={title} summary={<SummaryChip label="Filtered" value={rows.length} />} actions={menu}>{children}</TableCard> : <div className="section-toolbar"><span className="text-muted">{rows.length} records</span><CardActionMenu actions={menu} /></div>;
}
function recordsFor(kind: Kind): Row[] {
  const wb = useWorkbookStore.getState().workbook;
  if (kind !== 'ledger') return wb[kind] as Row[];
  return [...wb.transactions.map(row => ({ ...row, kind: 'trade' as const })), ...wb.transfers.map(row => ({ ...row, kind: 'transfer' as const })), ...wb.adjustments.map(row => ({ ...row, kind: 'adjustment' as const }))] as Row[];
}
export interface QseActionHeader { actions: StandardCardAction[]; summary: ReactNode; headerEnd: ReactNode }
export interface QseRecordActionProps {
  kind: Kind; rows: Array<Transaction | Transfer | Adjustment | Dividend | Row>;
  allRecords?: Array<Transaction | Transfer | Adjustment | Dividend | Row>;
  modifying: boolean; onModify: () => void;
  render?: (header: QseActionHeader) => ReactNode;
  extraActions?: StandardCardAction[];
  exportData?: { rows: object[]; allRows: object[] };
  editRequest?: Row | null;
  dateSort?: TableCardDateSort;
}
export function QseRecordActions({ kind, rows, allRecords, modifying, onModify, render, extraActions = [], exportData, editRequest }: QseRecordActionProps) {
  const workbook = useWorkbookStore(s => s.workbook);
  const ensureSignedIn = useEnsureSignedIn();
  const inputId = useId();
  const [storedEditing, setEditing] = useState<{ rows: Row[]; owner?: string; single?: boolean } | null>(null);
  const [dismissedRequest, setDismissedRequest] = useState<Row | null>(null);
  const requestSnapshot = useMemo(() => editRequest ? { rows: [structuredClone(editRequest)], owner: getCurrentUser()?.uid, single: true } : null, [editRequest]);
  const editing = requestSnapshot && dismissedRequest !== editRequest ? requestSnapshot : storedEditing;
  const columns = qseColumns(kind === 'ledger' && editing?.single ? editing.rows[0].kind === 'trade' ? 'transactions' : editing.rows[0].kind === 'transfer' ? 'transfers' : 'adjustments' : kind);
  const allRows = (allRecords ?? (kind === 'ledger' ? recordsFor(kind) : workbook[kind])) as Row[];
  const createRow = (): Row => {
    const base = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), seq: Math.max(0, ...recordsFor(kind).map(row => row.seq || 0)) + 1, timestamp: new Date().toISOString() };
    if (kind === 'transactions' || kind === 'ledger') return { ...base, ...(kind === 'ledger' ? { kind: 'trade' as const } : {}), ticker: '', action: 'BUY', shares: 0, price: 0 };
    if (kind === 'transfers') return { ...base, type: 'DEPOSIT', gross: 0, fee: 0 };
    if (kind === 'dividends') return { ...base, ticker: '', shares: 0, perShare: 0, amount: 0 };
    return { ...base, amount: 0, note: '' };
  };
  const locked = (row: Row) => (kind === 'transfers' || kind === 'ledger' && row.kind === 'transfer') && useInterEntityTransfersStore.getState().workbook.entries.some(link => (link.from.module === 'qse' && link.fromRecordId === row.id) || (link.to.module === 'qse' && link.toRecordId === row.id)) ? 'Linked transfer: use single Edit to handle both sides.' : undefined;
  const commit = (next: Row[]) => {
    const state = useWorkbookStore.getState();
    const wb = state.workbook;
    if (kind === 'ledger') {
      const strip = ({ kind: _kind, ...row }: Row) => row;
      state.setWorkbook({ ...wb, transactions: next.filter(row => row.kind === 'trade').map(strip) as Transaction[], transfers: next.filter(row => row.kind === 'transfer').map(strip) as Transfer[], adjustments: next.filter(row => row.kind === 'adjustment').map(strip) as Adjustment[] });
    } else if (kind === 'transactions') state.setWorkbook({ ...wb, transactions: next as Transaction[] });
    else if (kind === 'transfers') state.setWorkbook({ ...wb, transfers: next as Transfer[] });
    else if (kind === 'adjustments') state.setWorkbook({ ...wb, adjustments: next as Adjustment[] });
    else state.setWorkbook({ ...wb, dividends: next as Dividend[] });
  };
  const exportRows = (items: Array<Transaction | Transfer | Adjustment | Dividend | Row>, scope: string) => {
    if (exportData) {
      const data = scope === 'all' ? exportData.allRows : exportData.rows;
      const keys = [...new Set(exportData.allRows.flatMap(row => Object.keys(row)))];
      return download(`qse-${kind}-${scope}`, kind === 'ledger' ? keys.map(key => (key === 'kind' ? 'Type' : key === 'label' ? 'Description' : key === 'type' ? 'Transfer type' : key === 'description' ? 'Source description' : key)) : keys, data.map(row => keys.map(key => (row as Record<string, unknown>)[key])));
    }
    download(`qse-${kind}-${scope}`, columns.map(c => c.key), items.map(row => columns.map(c => (row as Row)[c.key])));
  };
  const importFile = async (file: File) => {
    try {
      const [headers, ...data] = parseCSV(await file.text());
      if (!headers || !data.length) throw new Error('The CSV has no records. Export this table to get the expected column headers.');
      const parsed = data.map((cells, index) => {
        const row: Row = { id: crypto.randomUUID(), date: '' };
        for (const c of columns.filter(c => c.key !== 'seq')) {
          const normalizedHeaders = headers.map(header => header.trim().toLowerCase());
          let position = normalizedHeaders.indexOf(c.key.toLowerCase());
          if (kind === 'ledger' && c.key === 'type') {
            position = normalizedHeaders.indexOf('transfer type');
            if (position < 0 && normalizedHeaders.includes('kind')) position = normalizedHeaders.indexOf('type');
          } else if (kind === 'ledger' && c.key === 'description' && normalizedHeaders.includes('source description')) {
            position = normalizedHeaders.indexOf('source description');
          } else if (position < 0) position = normalizedHeaders.indexOf(c.label.toLowerCase());
          const value = position < 0 ? '' : (cells[position] || '').trim();
          if (c.type === 'number') Object.assign(row, { [c.key]: value === '' ? 0 : Number(value) });
          else if (c.type === 'boolean') { if (value && !['true', 'false', '1', '0'].includes(value.toLowerCase())) throw new Error(`Row ${index + 2}: invalid boolean.`); row.isPending = value === '1' || value.toLowerCase() === 'true'; }
          else if (value) Object.assign(row, { [c.key]: c.key === 'kind' ? value.toLowerCase() : ['ticker', 'action', 'type'].includes(c.key) ? value.toUpperCase() : value });
        }
        const error = Object.values(validateQseRow(kind, row))[0];
        if (error) throw new Error(`Row ${index + 2}: ${error}`);
        if (kind === 'ledger') {
          const nativeKind = row.kind === 'trade' ? 'transactions' : row.kind === 'transfer' ? 'transfers' : 'adjustments';
          return Object.fromEntries([['id', row.id], ['kind', row.kind], ...qseColumns(nativeKind).filter(c => c.key !== 'seq' && row[c.key] !== undefined).map(c => [c.key, row[c.key]])]) as Row;
        }
        return row;
      });
      const current = recordsFor(kind);
      const signature = (row: Row) => {
        const nativeColumns = kind === 'ledger' ? qseColumns(row.kind === 'trade' ? 'transactions' : row.kind === 'transfer' ? 'transfers' : 'adjustments') : columns;
        return JSON.stringify([kind === 'ledger' ? row.kind : '', ...nativeColumns.filter(c => c.key !== 'seq').map(c => c.type === 'boolean' ? !!row[c.key] : row[c.key] ?? '')]);
      };
      const seen = new Set(current.map(signature));
      const unique = parsed.filter(row => { const key = signature(row); if (seen.has(key)) return false; seen.add(key); return true; });
      if (!unique.length) return toast('All imported rows already exist.');
      if (!(await confirmDialog(`Add ${unique.length} records; skip ${parsed.length - unique.length} duplicates. Existing records are retained.`, `Import QSE ${kind}?`))) return;
      if (!(await ensureSignedIn('Sign in to import records.'))) return;
      const latest = recordsFor(kind);
      if (JSON.stringify(latest) !== JSON.stringify(current)) throw new Error('Records changed during import. Please try again.');
      let seq = Math.max(0, ...latest.map(row => row.seq || 0));
      commit([...latest, ...unique.map(row => ({ ...row, seq: ++seq, timestamp: new Date().toISOString() }))]);
      toast(`Imported ${unique.length} records.`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Import failed.'); }
  };
  const actions: StandardCardAction[] = [
    { label: 'Import CSV', onClick: () => (document.getElementById(inputId) as HTMLInputElement | null)?.click() },
    { label: 'Export filtered', onClick: () => exportRows(rows, 'filtered'), disabled: !rows.length },
    { label: 'Export all', onClick: () => exportRows(allRows, 'all'), disabled: !allRows.length },
    { label: 'Batch edit', onClick: () => setEditing({ rows: structuredClone(rows) as Row[], owner: getCurrentUser()?.uid }) },
    { label: modifying ? 'Done modifying' : 'Modify', onClick: onModify }, ...extraActions,
  ];
  const header = { actions, summary: <SummaryChip label="Filtered" value={rows.length} />, headerEnd: modifying ? <IconButton label="Hide modification options" icon={<XIcon size={13} />} align="right" onClick={onModify} /> : null };
  return <>{render ? render(header) : <div className="section-toolbar">{header.summary}<CardActionMenu actions={actions} /></div>}
  <input id={inputId} type="file" accept=".csv,text/csv" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }} />
  {editing && <BatchEditGrid title={`${editing.single ? 'Edit' : 'Batch edit'} QSE ${kind}`} description="Reorder records sharing an effective time with the move buttons. Linked transfers must be edited individually." rows={editing.rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} getReorderGroup={row => `${row.date} ${toInstantMs(row.date, row.time, row.timezone)}${kind === 'transactions' ? ` ${row.ticker} ${row.action}` : kind === 'ledger' ? ` ${row.kind} ${row.kind === 'trade' ? `${row.ticker} ${row.action}` : ''}` : ''}`} orderKey="seq" createRow={editing.single ? undefined : createRow} validateRow={row => validateQseRow(kind, row)} rowReadOnly={editing.single ? undefined : locked} onClose={() => { setEditing(null); setDismissedRequest(editRequest ?? null); }} onSave={async (changes, mutations) => {
    if (!(await ensureSignedIn('Sign in to save changes.'))) throw new Error('Sign in is required.');
    if (editing.owner && editing.owner !== getCurrentUser()?.uid) throw new Error('Signed-in account changed. Reopen the editor.');
    let linkChoice: 'both' | 'this' | 'cancel' | undefined;
    const linked = editing.single && changes.find(change => locked(change.before));
    if (linked) {
      const choice = await resolveLinkedEdit('qse', linked.before.id);
      if (choice === 'cancel') throw new Error('Edit cancelled.');
      linkChoice = choice === 'both' ? 'both' : 'this';
    }
    commit(prepareBatch(recordsFor(kind), changes, [...columns.map(c => c.key), 'seq'], row => validateQseRow(kind, row), editing.single ? () => undefined : locked, mutations));
    if (linked && linkChoice === 'both') {
      const row = linked.after;
      const result = propagateLinkedEdit('qse', row.id, { date: row.date, amount: row.gross!, direction: row.type === 'DEPOSIT' ? 'in' : 'out' });
      if (result.error) toast(result.error);
    }
    toast('Changes saved.');
  }} />}</>;
}

/** Reorder exact-time peers; trades also share ticker and action so lot rules remain intact. */
export function QseReorder({ kind, row, rows }: { kind: Kind; row: Transaction | Transfer | Adjustment | Dividend | Row; rows: Array<Transaction | Transfer | Adjustment | Dividend | Row> }) {
  const ensureSignedIn = useEnsureSignedIn();
  const peers = rows.filter(candidate => (kind !== 'ledger' || (candidate as Row).kind === (row as Row).kind) && (kind !== 'transactions' && (kind !== 'ledger' || (row as Row).kind !== 'trade') || ((candidate as Transaction).ticker === (row as Transaction).ticker && (candidate as Transaction).action === (row as Transaction).action)));
  return <ReorderButtons rows={peers} index={peers.findIndex(candidate => candidate.id === row.id)} instantOf={candidate => toInstantMs(candidate.date, candidate.time, candidate.timezone)} idOf={candidate => candidate.id!} orderOf={candidate => candidate.seq} onMove={async pair => {
    if (!(await ensureSignedIn('Sign in to reorder records.'))) return;
    const state = useWorkbookStore.getState();
    const sourceKind = kind === 'ledger' ? (row as Row).kind === 'trade' ? 'transactions' : (row as Row).kind === 'transfer' ? 'transfers' : 'adjustments' : kind;
    const records = state.workbook[sourceKind];
    const a = records.find(candidate => candidate.id === pair[0].id), b = records.find(candidate => candidate.id === pair[1].id);
    if (!a || !b || toInstantMs(a.date, a.time, a.timezone) !== toInstantMs(b.date, b.time, b.timezone)) return toast('Records changed. Please try again.');
    const next = records.map(candidate => { const order = pair.find(item => item.id === candidate.id); return order ? { ...candidate, seq: order.order } : candidate; });
    if (sourceKind === 'transactions') state.setWorkbook({ ...state.workbook, transactions: next as Transaction[] });
    else if (sourceKind === 'transfers') state.setWorkbook({ ...state.workbook, transfers: next as Transfer[] });
    else if (sourceKind === 'adjustments') state.setWorkbook({ ...state.workbook, adjustments: next as Adjustment[] });
    else state.setWorkbook({ ...state.workbook, dividends: next as Dividend[] });
  }} />;
}

export function QseRecordCard({ title, sectionProps, children, ...props }: QseRecordActionProps & { title: ReactNode; sectionProps?: SectionCardProps; children: ReactNode }) {
  return <QseRecordActions {...props} render={header => <TableCard dateSort={props.dateSort} rows={props.rows} allRows={props.allRecords} title={title} {...sectionProps} actions={header.actions} summary={header.summary} headerEnd={header.headerEnd}>{children}</TableCard>} />;
}
