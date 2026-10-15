import { Children, cloneElement, Fragment, isValidElement, lazy, Suspense, useLayoutEffect, useRef, useState, type HTMLAttributes, type MouseEventHandler, type MouseEvent, type ReactNode } from 'react';
import { RecordDetailModal, type DetailField } from './RecordDetailModal';
import { Modal } from './Modal';
import { InvestmentTransactionEditor } from './InvestmentTransactionEditor';
import { InvestmentRecordEditor } from './InvestmentRecordEditor';
import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../store/fundsWorkbookStore';
import type { Transaction, Transfer, Adjustment, WatchlistItem } from '../types/workbook';
import { findLinkForRecord } from '../lib/linkCascade';
import type { LinkModule } from '../types/interEntityTransfer';
const TransferEditor = lazy(() => import('./RecordTransferEditor'));

function label(key: string): string { return ({ kind: 'Type', label: 'Description', id: 'ID', seq: 'Sequence' } as Record<string, string>)[key] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, char => char.toUpperCase()); }
function recordFields(record: unknown, prefix = ''): DetailField[] {
  if (!record || typeof record !== 'object') return [{ label: prefix || 'Value', value: String(record ?? '') }];
  return Object.entries(record).flatMap(([key, value]): DetailField[] => {
    if (value === undefined || typeof value === 'function') return [];
    const title = prefix ? `${prefix} / ${label(key)}` : label(key);
    if (value && typeof value === 'object' && !isValidElement(value)) return recordFields(value, title);
    return [{ label: title, value: typeof value === 'boolean' ? value ? 'Yes' : 'No' : isValidElement(value) ? value : String(value ?? '') }];
  });
}
type ChildProps = { children?: ReactNode; label?: string; title?: string; 'aria-label'?: string; onClick?: MouseEventHandler<HTMLButtonElement> };
function hasControl(children: ReactNode, name: string): boolean {
  return Children.toArray(children).some(child => {
    if (!isValidElement<ChildProps>(child)) return false;
    const props = child.props;
    return (!!props.onClick && [props.label, props.title, props['aria-label'], typeof props.children === 'string' ? props.children : ''].some(text => text && new RegExp(`^${name}(\\s|$)`, 'i').test(text))) || hasControl(props.children, name);
  });
}
function rowCells(children: ReactNode): React.ReactElement<ChildProps>[] {
  return Children.toArray(children).flatMap(child => !isValidElement<ChildProps>(child) ? [] : child.type === Fragment ? rowCells(child.props.children) : [child]);
}
function markInteractive(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<ChildProps>(child)) return child;
    return cloneElement(child, {
      ...(typeof child.type === 'string' && child.props.onClick ? { 'data-record-interactive': true } : {}),
      ...(child.props.children !== undefined ? { children: markInteractive(child.props.children) } : {}),
    });
  });
}
function textContent(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (!isValidElement<ChildProps & { value?: unknown; ticker?: string }>(child)) return typeof child === 'string' || typeof child === 'number' ? String(child) : '';
    if (child.type === 'button' || child.props.onClick || child.props.label) return '';
    return child.props.children ? textContent(child.props.children) : String(child.props.value ?? child.props.ticker ?? '');
  }).filter(Boolean).join(' ');
}

/** Source-backed details for data rows. Existing native editing controls remain the source of truth. */
export function RecordRow({ record, market, financeModule, onEdit, onCancel, onOpen, title = 'Record details', children, className, ...props }: Omit<HTMLAttributes<HTMLTableRowElement>, 'onClick'> & {
  record: unknown; market?: 'qse' | 'psx' | 'funds'; financeModule?: LinkModule; onEdit?: MouseEventHandler<HTMLButtonElement>; onCancel?: () => void; onOpen?: () => void; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(false);
  const data = record && typeof record === 'object' ? record as Record<string, unknown> : {};
  const workbook = market === 'qse' ? useWorkbookStore.getState().workbook : market === 'psx' ? usePSXWorkbookStore.getState().workbook : market === 'funds' ? useFundsWorkbookStore.getState().workbook : undefined;
  const source = data.sourceId ? data.kind === 'trade' ? workbook?.transactions.find(row => row.id === data.sourceId) : data.kind === 'transfer' ? workbook?.transfers.find(row => row.id === data.sourceId) : data.kind === 'adjustment' ? workbook?.adjustments.find(row => row.id === data.sourceId) : undefined : data.sellTxId || data.buyId ? workbook?.transactions.find(row => row.id === (data.sellTxId ?? data.buyId)) : undefined;
  const candidates = [source, data.source, data.tx, data.entry, data.t, data.transaction, data.a, data.item, data];
  const transaction = candidates.find(value => value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id && 'date' in value && 'ticker' in value && 'action' in value && 'shares' in value && 'price' in value) as Transaction | undefined;
  const transferCandidate = candidates.find(value => value && typeof value === 'object' && 'gross' in value && 'fee' in value && 'id' in value && typeof value.id === 'string') as Transfer | undefined;
  const transfer = workbook?.transfers.find(row => row.id === transferCandidate?.id);
  const adjustment = data.kind === 'adjustment' && source ? source as Adjustment : undefined;
  const watchlist = candidates.find(value => value && typeof value === 'object' && 'ticker' in value && 'target' in value) as WatchlistItem | undefined;
  const financeRecord = candidates.find(value => value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') as { id: string } | undefined;
  const linked = financeModule && financeRecord ? findLinkForRecord(financeModule, financeRecord.id) : undefined;
  const nativeEdit = !!linked || !!market && !!(transaction || transfer || adjustment || watchlist);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const editing = !!onCancel && hasControl(children, 'save') && hasControl(children, 'cancel');
  useLayoutEffect(() => {
    if (open || editing) {
      const labels = Array.from(rowRef.current?.closest('table')?.querySelectorAll('thead tr:last-child th') ?? []).map(cell => cell.textContent?.trim() || 'Field');
      setHeaders(previous => JSON.stringify(previous) === JSON.stringify(labels) ? previous : labels);
    }
  }, [open, editing]);
  const cells = rowCells(children);
  const fields = open ? [...recordFields(source ? { ...data, source } : record), ...cells.flatMap((cell, index) => {
    const value = textContent(cell.props.children);
    return value ? [{ label: `Table / ${headers[index] || `Column ${index + 1}`}`, value }] : [];
  })] : [];
  const interact = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || !event.currentTarget.contains(target) || target.closest('button,a,input,select,textarea,label,[role="button"],[role="link"],[data-record-interactive],.tooltip-trigger,[contenteditable="true"]') || window.getSelection()?.toString()) return;
    event.stopPropagation(); setOpen(true);
  };
  return <>
    <tr {...props} ref={rowRef} className={`record-row clickable ${className ?? ''}`} tabIndex={0} onClickCapture={event => {
      props.onClickCapture?.(event);
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      if (nativeEdit && event.currentTarget.contains(target) && button && /^edit\b/i.test(button.getAttribute('aria-label') || button.textContent || '')) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); setEditTrade(true);
      }
    }} onClick={interact} onKeyDown={event => {
      props.onKeyDown?.(event);
      if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setOpen(true); }
    }}>{editing ? <td colSpan={Math.max(1, cells.length)}>Editing record…</td> : markInteractive(children)}</tr>
    {open && !editing && <RecordDetailModal title={title} fields={fields} onClose={() => setOpen(false)} onEdit={nativeEdit ? () => { setOpen(false); setEditTrade(true); } : onEdit ? event => { setOpen(false); onEdit(event); } : undefined} onOpen={onOpen ? () => { setOpen(false); onOpen(); } : undefined} />}
    {editTrade && market && transaction && <InvestmentTransactionEditor transaction={transaction} market={market} onClose={() => setEditTrade(false)} />}
    {editTrade && market && !transaction && transfer && <Suspense fallback={<Modal title="Edit transfer" onClose={() => setEditTrade(false)}><p role="status">Opening transfer editor…</p></Modal>}><TransferEditor editTransfer={{ module: market, record: transfer }} onClose={() => setEditTrade(false)} /></Suspense>}
    {editTrade && market && !transaction && !transfer && (watchlist || adjustment) && <InvestmentRecordEditor market={market} watchlist={watchlist} adjustment={adjustment} onClose={() => setEditTrade(false)} />}
    {editTrade && linked && financeRecord && <Suspense fallback={<Modal title="Edit transfer" onClose={() => setEditTrade(false)}><p role="status">Opening transfer editor…</p></Modal>}><TransferEditor editLink={{ link: linked, recordId: financeRecord.id }} onClose={() => setEditTrade(false)} /></Suspense>}
    {editing && <Modal title="Edit record" onClose={onCancel!} widthClass="60"><div className="record-edit-form">{cells.map((cell, index) => <div key={index} className="record-edit-field"><div className="text-muted">{headers[index] || `Field ${index + 1}`}</div>{cell.props.children}</div>)}</div></Modal>}
  </>;
}
