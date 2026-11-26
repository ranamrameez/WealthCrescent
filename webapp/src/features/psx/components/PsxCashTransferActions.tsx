import { STATEMENT_FILE_ACCEPT } from '../../../lib/statementImportFile';
import { useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StatCard2 } from '../../../components/StatCard2';
import { StandardButton } from '../../../components/standard/Button';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { toast } from '../../../components/Toast';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { readPsxCashStatement, type CashTransferSource } from '../../../lib/psxCashStatement';
import { applyPsxCashTransfers, isAhlBroker, preparePsxCashTransferReview, statementAmountsAgree, type CashChoice, type PsxCashPreview } from '../../../services/finance/psxCashTransferReview';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import type { Transfer } from '../../../types/workbook';

type CashRecord = Pick<CashTransferSource, 'date' | 'type' | 'gross' | 'fee' | 'description' | 'time' | 'timezone'>;
const fields = (record: CashRecord, currency: string): [string, string | number][] => [
  ['Date', record.date], ['Direction', record.type], [`Gross (${currency})`, record.gross],
  [`Fee (${currency})`, record.fee ?? '—'], ['Time', record.time ?? '—'], ['Time zone', record.timezone ?? '—'],
  ['Description', record.description ?? '—'],
];

function TransferCard({ record, compare, title, currency }: { record: CashRecord; compare?: CashRecord; title: string; currency: string }) {
  const comparison = new Map(compare && fields(compare, currency));
  return <div className="card stack-sm">
    <strong>{title}</strong>
    <div className="stat-card-2-grid record-detail-grid">
      {fields(record, currency).map(([label, value]) =>
        <StatCard2 key={label} label={label}
          value={typeof value === 'number' ? value.toLocaleString(undefined, { maximumSignificantDigits: 15 }) : value}
          descriptionColor="var(--warn)" description={value !== '—' && comparison.has(label) && comparison.get(label) !== '—' && comparison.get(label) !== value ? 'Differs' : undefined} />)}
    </div>
  </div>;
}

const statusLabels = { new: 'New', matched: 'Matched', mismatch: 'Values differ', ambiguous: 'Needs review', existing: 'Existing only' };
type ReviewRow = PsxCashPreview['rows'][number] | { source: Transfer; status: 'existing'; candidates: [] };

function CashTransferReview({ preview, fileName, close }: { preview: PsxCashPreview; fileName?: string; close: () => void }) {
  const [choices, setChoices] = useState(new Map<string, CashChoice>());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const newRows = preview.rows.filter(row => row.status === 'new');
  const list: ReviewRow[] = [...preview.rows,
    ...preview.existingOnly.map(source => ({ source, status: 'existing' as const, candidates: [] as [] }))];
  const { rows, controls } = useTablePagination(list.filter(({ source, status }) =>
    (filter === 'all' || filter === status) &&
    `${source.date} ${source.type} ${source.gross} ${source.description ?? ''} ${'accountName' in source ? source.accountName ?? '' : ''}`
      .toLowerCase().includes(search.trim().toLowerCase()),
  ));
  const apply = () => {
    try {
      const { added, reconciled } = applyPsxCashTransfers(preview, choices);
      toast(`Added ${added} and reconciled ${reconciled} PSX cash transfers.`);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save cash transfers.');
    }
  };
  const sourceLabel = preview.statement ? 'Statement' : 'Bank';
  return <Modal title={preview.statement ? 'Review cash statement' : 'Sync PSX AHL bank transfers'} onClose={close} widthClass="60" manageFocus>
    <div className="stack-md">
      <p>{preview.brokerName} · {fileName ?? 'Cleared bank transfers'}</p>
      {!preview.rows.length && <Notice tone="warning">No matching cleared bank transfers found in {preview.currency}.</Notice>}
      <div className="row gap-sm">
        {Object.entries(statusLabels).map(([status, label]) => <StatCard2 key={status} label={label} value={list.filter(row => row.status === status).length} />)}
      </div>
      <p>{preview.statement
        ? 'Review each transfer. For an existing transfer with different amounts, use the statement values. The app retains finer decimals when they round to the statement amount.'
        : 'Review the values side by side. Choose which transfers to add and how to reconcile overlaps.'}</p>
      <div className="row gap-sm">
        <StandardButton tone="secondary" disabled={!newRows.length} onClick={() => setChoices(current => {
          const next = new Map(current);
          for (const row of newRows) next.set(row.source.sourceId, { action: 'add' });
          return next;
        })}>Select all new records</StandardButton>
        <StandardButton tone="secondary" disabled={!choices.size} onClick={() => setChoices(new Map())}>Clear selection</StandardButton>
      </div>
      <div className="row gap-sm">
        <Field label="Show records"><Select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All</option>
          {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </Select></Field>
        <Field label="Filter by date, amount, or description"><TextInput value={search} onChange={event => setSearch(event.target.value)} /></Field>
      </div>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      <div className="row gap-sm">
        <StandardButton disabled={!choices.size} onClick={apply}>Save selected records ({choices.size})</StandardButton>
        <StandardButton tone="secondary" onClick={close}>Cancel</StandardButton>
      </div>
      {controls}
      {rows.map(({ source, status, candidates }) => {
        if (!('sourceId' in source)) return <TransferCard key={source.id} title="Existing only" record={source} currency={preview.currency} />;
        const { sourceId } = source;
        const choice = choices.get(sourceId);
        const selected = choice ? choice.action === 'add' ? 'add' : `${choice.action}:${choice.id}` : '';
        const choose = (value: string) => setChoices(current => {
          const next = new Map(current);
          const [action, id] = value.split(/:(.*)/s);
          if (action === 'add') next.set(sourceId, { action });
          else if (action === 'keep' || action === 'replace') next.set(sourceId, { action, id });
          else next.delete(sourceId);
          return next;
        });
        const allowAdd = (status === 'new' || status === 'ambiguous') && !source.linkedTransferId;
        return <section key={sourceId} className="stack-sm" aria-label={`${statusLabels[status]} · ${source.date} · ${source.gross}`}>
          <h4>{statusLabels[status]} · {source.date} · {source.type}</h4>
          <div className="grid-auto">
            {candidates.map((record, index) => <TransferCard key={record.id} title={`Existing ${index + 1}${preview.linkedIds.has(record.id) ? ' (linked)' : ''}`}
              record={record} compare={source} currency={preview.currency} />)}
            <TransferCard title={source.accountName ? `${sourceLabel} · ${source.accountName}` : sourceLabel} record={source}
              compare={candidates.find(row => choice?.action !== 'add' && row.id === choice?.id) ?? (candidates.length === 1 ? candidates[0] : undefined)}
              currency={preview.currency} />
          </div>
          {candidates.length === 0 && source.linkedTransferId
            ? <Notice tone="warning">The bank transfer is linked to a PSX record outside this ledger. Review its transfer link.</Notice>
            : status === 'new'
              ? <label><input type="checkbox" checked={selected === 'add'} onChange={event => choose(event.target.checked ? 'add' : '')} /> Add this new transfer</label>
              : <Field label="Reconciliation choice"><Select value={selected} onChange={event => choose(event.target.value)}>
                <option value="">Skip this source row</option>
                {candidates.map((record, index) => (!preview.statement || statementAmountsAgree(source, record))
                  ? <option key={record.id} value={`keep:${record.id}`}>Keep existing {index + 1}</option> : null)}
                {candidates.map((record, index) => !preview.linkedIds.has(record.id) && status !== 'matched'
                  ? <option key={record.id} value={`replace:${record.id}`}>Use {sourceLabel.toLowerCase()} values for existing {index + 1}</option> : null)}
                {allowAdd && <option value="add">Add as a separate transfer</option>}
              </Select></Field>}
        </section>;
      })}
    </div>
  </Modal>;
}

export function PsxCashTransferActions({ statementOnly = false, label = 'Import cash statement' }: { statementOnly?: boolean; label?: string } = {}) {
  const broker = usePSXWorkbookStore(state => state.workbook.brokerProfiles.find(profile => profile.id === state.workbook.activeBrokerId));
  const ensureSignedIn = useEnsureSignedIn();
  const upload = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [review, setReview] = useState<{ preview: PsxCashPreview; fileName?: string }>();

  const open = async (file?: File) => {
    if (busy.current) return;
    busy.current = true;
    const originalOwner = getCurrentUser()?.uid;
    try {
      if (!(await ensureSignedIn('Sign in to reconcile PSX cash transfers.'))) return;
      const owner = getCurrentUser()?.uid;
      const statement = file ? await readPsxCashStatement(file) : undefined;
      const preview = preparePsxCashTransferReview(statement);
      if (!owner || preview.owner !== owner || (originalOwner && owner !== originalOwner) || preview.brokerId !== broker?.id) {
        throw new Error('The account or broker changed. Open the review again.');
      }
      setReview({ preview, fileName: file?.name });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not open the cash-transfer review.');
    } finally {
      busy.current = false;
    }
  };

  return <>
    <div className="row gap-sm justify-end">
      <input ref={upload} type="file" hidden accept={STATEMENT_FILE_ACCEPT}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void open(file);
        }} />
      <StandardButton size="small" tone="secondary" onClick={() => upload.current?.click()}>{label}</StandardButton>
      {!statementOnly && broker && isAhlBroker(broker.id, broker.name) &&
        <StandardButton size="small" tone="secondary" onClick={() => void open()}>Sync bank transfers</StandardButton>}
    </div>
    {review && <CashTransferReview {...review} close={() => setReview(undefined)} />}
  </>;
}
