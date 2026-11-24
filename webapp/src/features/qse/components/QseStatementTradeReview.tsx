import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StatCard2 } from '../../../components/StatCard2';
import { StandardButton } from '../../../components/standard/Button';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { applyQseStatementTrades, type QseStatementTradePreview } from '../../../services/finance/qseStatementImportService';
import { toast } from '../../../components/Toast';
import type { StatementRecord } from '../../../lib/theGroupStatement';

const recordLabel = (row: StatementRecord) =>
  row.kind === 'trade' ? row.ticker : row.kind === 'transfer' ? 'Cash transfer' : 'Trading reward';

function recordFields(record: StatementRecord, currency: string): Array<[string, string | number]> {
  const date: [string, string] = ['Date', record.date];
  switch (record.kind) {
    case 'trade': return [['Symbol', record.ticker], date, ['Side', record.action], ['Shares', record.shares], [`Price (${currency})`, record.price]];
    case 'transfer': return [date, ['Direction', record.type], [`Gross (${currency})`, record.gross], [`Fee (${currency})`, record.fee]];
    case 'adjustment': return [date, [`Amount (${currency})`, record.amount]];
  }
}

function RecordCard({ title, record, compare, currency }: { title: string; record: StatementRecord; compare?: StatementRecord; currency: string }) {
  const comparison = new Map(compare ? recordFields(compare, currency) : []);
  return <div className="card stack-sm">
    <strong>{title}</strong>
    <div className="stat-card-2-grid record-detail-grid">
      {recordFields(record, currency).map(([label, value]) => {
        const display = typeof value === 'number' ? value.toLocaleString(undefined, { maximumSignificantDigits: 15 }) : value;
        return <StatCard2 key={label} label={label} value={display}
          descriptionColor="var(--warn)" description={comparison.has(label) && comparison.get(label) !== value ? 'Differs' : undefined} />;
      })}
    </div>
  </div>;
}

export function QseStatementTradeReview(props: { preview: QseStatementTradePreview; onClose: () => void }) {
  return <Modal title="Review The Group statement" onClose={props.onClose} widthClass="60" manageFocus>
    <QseStatementTradeReviewContent {...props} />
  </Modal>;
}

export function QseStatementTradeReviewContent({ preview, onClose }: { preview: QseStatementTradePreview; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const addable = preview.rows.filter(row => !row.match && !row.conflict && !row.blocked && !row.protectedReward);
  const matches = preview.rows.filter(row => row.match && !row.conflict && !row.blocked && !row.protectedReward);
  const conflicts = preview.rows.filter(row => row.conflict);
  const mismatches = preview.rows.filter(row => row.mismatched);
  const filtered = preview.rows.filter(row => {
    const category = row.conflict ? 'conflicts' : row.match ? 'matches' : 'new';
    return (filter === 'all' || filter === category || (filter === 'mismatches' && row.mismatched)) &&
      `${recordLabel(row.incoming)} ${row.incoming.date} ${row.incoming.kind === 'transfer' ? row.incoming.type : ''}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const { rows, controls } = useTablePagination(filtered);
  const select = (indices: number[], useStatement: boolean) => setSelected(current => {
    const next = new Set(current);
    for (const index of indices) {
      if (useStatement) next.add(index);
      else next.delete(index);
    }
    return next;
  });

  const apply = () => {
    try {
      const result = applyQseStatementTrades(preview, selected);
      toast(result.added || result.updated ? `Added ${result.added} records and updated ${result.updated} matches.` : 'The selected records already match the ledger.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected records could not be imported.');
    }
  };

  return <div className="stack-md">
      <p>{preview.fileName} · {preview.brokerName}</p>
      <Notice tone="warning">The statement rounds cash amounts and commissions. Trade values use the statement’s shares and price with the broker’s configured fees. Existing fee overrides are kept. New rewards and transfers use the statement amounts. Existing reward amounts are protected. Stored transfer amounts and fees are kept when they round to the statement figure.</Notice>
      <div className="row gap-sm">
        <StatCard2 label="New" value={addable.length} />
        <StatCard2 label="Matched" value={matches.length} />
        <StatCard2 label="Mismatched" value={mismatches.length} />
        <StatCard2 label="Needs review" value={conflicts.length} />
      </div>
      <p>Keep existing values for matched records and import statement values for new records. Use the checkbox on a mismatch to replace the stored values.</p>
      <div className="row gap-sm">
        <StandardButton tone="secondary" disabled={!addable.length} onClick={() => select(addable.map(row => row.index), true)}>Select all new records</StandardButton>
        <StandardButton tone="secondary" disabled={!matches.length} onClick={() => select(matches.map(row => row.index), false)}>Keep all existing matches</StandardButton>
        <StandardButton tone="secondary" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</StandardButton>
      </div>
      <div className="row gap-sm">
        <Field label="Show records"><Select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="new">New</option><option value="matches">Matched</option><option value="mismatches">Mismatched</option><option value="conflicts">Needs review</option></Select></Field>
        <Field label="Filter by symbol, type, or date"><TextInput value={search} onChange={event => setSearch(event.target.value)} /></Field>
      </div>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      <div className="row gap-sm">
        <StandardButton disabled={!selected.size} onClick={apply}>Import selected records ({selected.size})</StandardButton>
        <StandardButton tone="secondary" onClick={onClose}>Cancel</StandardButton>
      </div>
      {controls}
      {rows.map(({ index, incoming, match, conflict, mismatched, blocked, protectedReward }) => {
        const label = recordLabel(incoming);
        const direction = incoming.kind === 'trade' ? incoming.action : incoming.kind === 'transfer' ? incoming.type : '';
        return <section key={index} className="stack-sm" aria-label={`${label} ${incoming.date} ${direction}, statement record ${index + 1}`}>
          <h4>{label} · {incoming.date}{direction && ` · ${direction}`}</h4>
          {mismatched && <Notice tone="warning">Values differ. {selected.has(index) ? 'Statement values selected.' : 'Keeping existing values (recommended).'}</Notice>}
          {conflict && <Notice tone="warning">{conflict.message}</Notice>}
          {blocked && <Notice tone="warning">Use Modify to change the gross amount on this linked transfer.</Notice>}
          <div className="grid-auto">
            {(conflict?.existing ?? (match ? [match] : [])).map((record, at) =>
              <RecordCard key={record.id ?? at} title="Existing" record={record} compare={incoming} currency={preview.currency} />)}
            <RecordCard title={match || conflict ? 'Statement' : 'New statement record'} record={incoming} compare={match} currency={preview.currency} />
          </div>
          {!conflict && !blocked && <label>
            <input type="checkbox" checked={selected.has(index)} disabled={protectedReward} onChange={event => select([index], event.target.checked)} />
            {protectedReward ? ' Existing reward amount is protected. Edit it with Modify.' : match ? ' Use statement values for this match' : ' Import this new record'}
          </label>}
        </section>;
      })}
  </div>;
}
