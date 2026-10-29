import type { TableCardDateSort } from '../../../components/tableSortContext';
import { parseTheGroupStatement, readStatementXlsx, type StatementRecord } from '../../../lib/theGroupStatement';
import { TransactionEntryModal } from '../../../components/TransactionEntryModal';
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
export type QseRow = { id: string; kind?: 'trade' | 'transfer' | 'adjustment'; seq?: number; date: string; time?: string; timezone?: string; ticker?: string; action?: string; shares?: number; price?: number; gross?: number; fee?: number; type?: string; description?: string; amount?: number; note?: string; perShare?: number; isPending?: boolean; targetLotBuyId?: string; feeOverride?: number };
type Row = QseRow;
const column = (key: keyof Row, label: string, type: BatchColumn<Row>['type'] = 'text'): BatchColumn<Row> => ({ key, label, type });
function qseColumns(kind: Kind): BatchColumn<Row>[] {
  const common = [{ ...column('seq', 'Stock #', 'number'), editable: false }, column('date', 'Date', 'date'), column('time', 'Time', 'time'), column('timezone', 'Timezone')];
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
  const transferEdit = editing?.single && (kind === 'transfers' || editing.rows[0].kind === 'transfer');
  const closeEditor = () => { setEditing(null); setDismissedRequest(editRequest ?? null); };
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
    const keys = [...new Set(['id', ...columns.map(c => c.key), ...allRows.flatMap(row => Object.keys(row))])];
    download(`qse-${kind}-${scope}`, keys, items.map(row => keys.map(key => (row as unknown as Record<string, unknown>)[key])));
  };
  const importFile = async (file: File) => {
    try {
      const current = recordsFor(kind);
      const xlsx = /\.xlsx$/i.test(file.name);
      const table = xlsx ? readStatementXlsx(new Uint8Array(await file.arrayBuffer())) : parseCSV(await file.text());
      const isStatement = xlsx || table.some(row => row[0]?.trim().toLowerCase() === 'date' && row[1]?.trim().toLowerCase() === 'type' && row[2]?.trim().toLowerCase() === 'count');
      let statementWarning = '';
      let importTable = table;
      if (isStatement) {
        if (kind !== 'ledger' && kind !== 'transactions') throw new Error('Import The Group statements from Cash ledger or Trade list.');
        if (!(await confirmDialog(
          'The Group Excel statement contains rounded cash amounts instead of exact figures. Importing rounded numbers may produce incorrect balances, fees, profit/loss and other calculations. Use an exact statement where available and verify the imported figures. Rounded rewards will be excluded; existing exact rewards are retained. Continue to review this import?',
          'Warning: rounded statement figures',
        ))) return;
        const existing = recordsFor('ledger').filter(row => row.kind !== 'adjustment') as StatementRecord[];
        const result = parseTheGroupStatement(table, existing);
        statementWarning = result.warning;
        const records = kind === 'transactions' ? result.records.filter(row => row.kind === 'trade') : result.records;
        const keys = ['id', 'kind', 'date', 'ticker', 'action', 'shares', 'price', 'type', 'gross', 'fee', 'description', 'time', 'timezone'];
        importTable = [keys, ...records.map(row => keys.map(key => String((row as unknown as Record<string, unknown>)[key] ?? '')))];
      }
      const [headers, ...data] = importTable;
      if (!headers || !data.length) throw new Error('The CSV has no records. Export this table to get the expected column headers.');
      const explicitIds = new Set<string>();
      const parsed = data.map((cells, index) => {
        const idColumn = headers.findIndex(header => header.trim().toLowerCase() === 'id');
        const importedId = idColumn < 0 ? '' : cells[idColumn]?.trim();
        if (importedId) explicitIds.add(importedId);
        const row: Row = { id: importedId || crypto.randomUUID(), date: '' };
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
        const trade = kind === 'transactions' || kind === 'ledger' && row.kind === 'trade';
        if (trade) {
          const lotColumn = headers.findIndex(header => header.trim().toLowerCase() === 'targetlotbuyid');
          if (lotColumn >= 0 && cells[lotColumn]?.trim()) row.targetLotBuyId = cells[lotColumn].trim();
          const feeColumn = headers.findIndex(header => header.trim().toLowerCase() === 'feeoverride');
          if (feeColumn >= 0 && cells[feeColumn]?.trim()) {
            row.feeOverride = Number(cells[feeColumn]);
            if (!Number.isFinite(row.feeOverride) || row.feeOverride < 0) throw new Error(`Row ${index + 2}: invalid fee override.`);
          }
        }
        const error = Object.values(validateQseRow(kind, row))[0];
        if (error) throw new Error(`Row ${index + 2}: ${error}`);
        if (kind === 'ledger') {
          const nativeKind = row.kind === 'trade' ? 'transactions' : row.kind === 'transfer' ? 'transfers' : 'adjustments';
          return { ...Object.fromEntries([['id', row.id], ['kind', row.kind], ...qseColumns(nativeKind).filter(c => c.key !== 'seq' && row[c.key] !== undefined).map(c => [c.key, row[c.key]])]), ...(trade && row.targetLotBuyId ? { targetLotBuyId: row.targetLotBuyId } : {}), ...(trade && row.feeOverride !== undefined ? { feeOverride: row.feeOverride } : {}) } as Row;
        }
        return row;
      });
      const signature = (row: Row) => {
        const nativeColumns = kind === 'ledger' ? qseColumns(row.kind === 'trade' ? 'transactions' : row.kind === 'transfer' ? 'transfers' : 'adjustments') : columns;
        return JSON.stringify([kind === 'ledger' ? row.kind : '', ...nativeColumns.filter(c => c.key !== 'seq').map(c => c.type === 'boolean' ? !!row[c.key] : row[c.key] ?? '')]);
      };
      const importedIds = new Set<string>();
      const updates: Row[] = [];
      const additions: Row[] = [];
      const seen = new Set(current.map(signature));
      for (const row of parsed) {
        if (importedIds.has(row.id)) throw new Error('The import contains repeated record IDs.');
        importedIds.add(row.id);
        const before = current.find(item => item.id === row.id);
        if (before) {
          if (kind === 'ledger' && before.kind !== row.kind) throw new Error('An imported ID cannot change its source type.');
          const merged = { ...before, ...row };
          if (locked(before) && (before.gross !== merged.gross || before.type !== merged.type || before.date !== merged.date)) throw new Error('Use single Modify to change the amount, direction or date of a linked transfer. Fee and description corrections can be imported safely.');
          if (signature(before) !== signature(merged) || before.targetLotBuyId !== merged.targetLotBuyId || before.feeOverride !== merged.feeOverride) updates.push(merged);
        } else {
          const sig = signature(row);
          if (isStatement || explicitIds.has(row.id) || !seen.has(sig)) { additions.push(row); seen.add(sig); }
        }
      }
      if (!additions.length && !updates.length) return toast(statementWarning || 'All imported rows already exist.');
      if (!(await confirmDialog(`Add ${additions.length} records; update ${updates.length} matching IDs; skip ${parsed.length - additions.length - updates.length} unchanged records. Existing records are retained.${statementWarning ? '\n' + statementWarning : ''}`, `Import QSE ${kind}?`))) return;
      if (!(await ensureSignedIn('Sign in to import records.'))) return;
      const latest = recordsFor(kind);
      if (JSON.stringify(latest) !== JSON.stringify(current)) throw new Error('Records changed during import. Please try again.');
      let seq = Math.max(0, ...latest.map(row => row.seq || 0));
      commit([...latest.map(row => updates.find(update => update.id === row.id) ?? row), ...additions.map(row => ({ ...row, seq: ++seq, timestamp: new Date().toISOString() }))]);
      toast(`Imported ${additions.length} records; updated ${updates.length}.${statementWarning ? ' ' + statementWarning : ''}`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Import failed.'); }
  };
  const actions: StandardCardAction[] = [
    { label: 'Import CSV', onClick: () => (document.getElementById(inputId) as HTMLInputElement | null)?.click() },
    ...(['ledger', 'transactions'].includes(kind) ? [{ label: 'Import The Group statement', onClick: () => (document.getElementById(inputId) as HTMLInputElement | null)?.click() }] : []),
    { label: 'Export filtered', onClick: () => exportRows(rows, 'filtered'), disabled: !rows.length },
    { label: 'Export all', onClick: () => exportRows(allRows, 'all'), disabled: !allRows.length },
    { label: 'Batch edit', onClick: () => setEditing({ rows: structuredClone(rows) as Row[], owner: getCurrentUser()?.uid }) },
    { label: modifying ? 'Done modifying' : 'Modify', onClick: onModify }, ...extraActions,
  ];
  const header = { actions, summary: <SummaryChip label="Filtered" value={rows.length} />, headerEnd: modifying ? <IconButton label="Hide modification options" icon={<XIcon size={13} />} align="right" onClick={onModify} /> : null };
  return <>{render ? render(header) : <div className="section-toolbar">{header.summary}<CardActionMenu actions={actions} /></div>}
  <input id={inputId} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }} />
  {editing && transferEdit && <TransactionEntryModal editTransfer={{ module: 'qse', record: Object.fromEntries(Object.entries(editing.rows[0]).filter(([key]) => key !== 'kind')) as unknown as Transfer }} onClose={closeEditor} />}
  {editing && !transferEdit && <BatchEditGrid title={`${editing.single ? 'Edit' : 'Batch edit'} QSE ${kind}`} description="Reorder records sharing an effective time with the move buttons. Linked transfers must be edited individually." rows={editing.rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} getReorderGroup={row => `${row.date} ${toInstantMs(row.date, row.time, row.timezone)}${kind === 'transactions' ? ` ${row.ticker} ${row.action}` : kind === 'ledger' ? ` ${row.kind} ${row.kind === 'trade' ? `${row.ticker} ${row.action}` : ''}` : ''}`} orderKey="seq" createRow={editing.single ? undefined : createRow} validateRow={row => validateQseRow(kind, row)} rowReadOnly={editing.single ? undefined : locked} onClose={closeEditor} onSave={async (changes, mutations) => {
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

/** Reorder trades across the full exchange ledger. transactionIndex is the global
 * accounting sequence; seq remains the per-ticker sequence; id remains stable. */
export function QseReorder({ kind, row, rows }: { kind: Kind; row: Transaction | Transfer | Adjustment | Dividend | Row; rows: Array<Transaction | Transfer | Adjustment | Dividend | Row> }) {
  const ensureSignedIn = useEnsureSignedIn();
  const isTrade = kind === 'transactions' || (kind === 'ledger' && (row as Row).kind === 'trade');
  const peers = rows
    .filter(candidate => isTrade
      ? (kind !== 'ledger' || (candidate as Row).kind === 'trade')
      : (kind !== 'ledger' || (candidate as Row).kind === (row as Row).kind))
    .sort((a, b) => isTrade
      ? ((a as Transaction).transactionIndex ?? Number.MAX_SAFE_INTEGER) - ((b as Transaction).transactionIndex ?? Number.MAX_SAFE_INTEGER)
      : toInstantMs(a.date, a.time, a.timezone) - toInstantMs(b.date, b.time, b.timezone) || ((a as { seq?: number }).seq ?? 0) - ((b as { seq?: number }).seq ?? 0));
  return <ReorderButtons rows={peers} index={peers.findIndex(candidate => candidate.id === row.id)} instantOf={candidate => isTrade ? Date.parse(`${candidate.date}T00:00:00Z`) : toInstantMs(candidate.date, candidate.time, candidate.timezone)} idOf={candidate => candidate.id!} orderOf={candidate => isTrade ? (candidate as Transaction).transactionIndex : (candidate as { seq?: number }).seq} allowAcrossInstants={isTrade} onMove={async pair => {
    if (!(await ensureSignedIn('Sign in to reorder records.'))) return;
    const state = useWorkbookStore.getState();
    const sourceKind = kind === 'ledger' ? (row as Row).kind === 'trade' ? 'transactions' : (row as Row).kind === 'transfer' ? 'transfers' : 'adjustments' : kind;
    const records = state.workbook[sourceKind];
    const a = records.find(candidate => candidate.id === pair[0].id), b = records.find(candidate => candidate.id === pair[1].id);
    if (!a || !b) return toast('Records changed. Please try again.');
    if (sourceKind === 'transactions') {
      const aIndex = (a as Transaction).transactionIndex;
      const bIndex = (b as Transaction).transactionIndex;
      if (!Number.isInteger(aIndex) || !Number.isInteger(bIndex)) return toast('Transaction order is missing. Reload the workbook and try again.');
      const sameTicker = (a as Transaction).ticker === (b as Transaction).ticker;
      const aSeq = (a as Transaction).seq;
      const bSeq = (b as Transaction).seq;
      const transactions = records.map(candidate => {
        if (candidate.id === a.id) return { ...candidate, transactionIndex: bIndex, ...(sameTicker ? { seq: bSeq } : {}) };
        if (candidate.id === b.id) return { ...candidate, transactionIndex: aIndex, ...(sameTicker ? { seq: aSeq } : {}) };
        return candidate;
      }) as Transaction[];
      state.setWorkbook({ ...state.workbook, transactions });
      return;
    }
    if (toInstantMs(a.date, a.time, a.timezone) !== toInstantMs(b.date, b.time, b.timezone)) return toast('Records changed. Please try again.');
    const next = records.map(candidate => { const order = pair.find(item => item.id === candidate.id); return order ? { ...candidate, seq: order.order } : candidate; });
    if (sourceKind === 'transfers') state.setWorkbook({ ...state.workbook, transfers: next as Transfer[] });
    else if (sourceKind === 'adjustments') state.setWorkbook({ ...state.workbook, adjustments: next as Adjustment[] });
    else state.setWorkbook({ ...state.workbook, dividends: next as Dividend[] });
  }} />;
}

export function QseRecordCard({ title, sectionProps, children, ...props }: QseRecordActionProps & { title: ReactNode; sectionProps?: SectionCardProps; children: ReactNode }) {
  return <QseRecordActions {...props} render={header => <TableCard dateSort={props.dateSort} rows={props.rows} allRows={props.allRecords} title={title} {...sectionProps} actions={header.actions} summary={header.summary} headerEnd={header.headerEnd}>{children}</TableCard>} />;
}
