import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StatCard2 } from '../../../components/StatCard2';
import { StandardButton } from '../../../components/standard/Button';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { applyQseStatementTrades, type QseStatementTradePreview } from '../../../services/finance/qseStatementImportService';
import { toast } from '../../../components/Toast';
import type { Transaction } from '../../../types/workbook';

function TradeCard({ title, trade, currency }: { title: string; trade: Transaction; currency: string }) {
  return <div className="card stack-sm">
    <strong>{title}</strong>
    <div className="stat-card-2-grid record-detail-grid">
      <StatCard2 label="Symbol" value={trade.ticker} />
      <StatCard2 label="Trade date" value={trade.date} />
      <StatCard2 label="Side" value={trade.action} />
      <StatCard2 label="Shares" value={trade.shares.toLocaleString()} />
      <StatCard2 label={`Price (${currency})`} value={trade.price.toLocaleString(undefined, { maximumSignificantDigits: 15 })} />
    </div>
  </div>;
}

export function QseStatementTradeReview(props: { preview: QseStatementTradePreview; onClose: () => void }) {
  return <Modal title="Review The Group trades" onClose={props.onClose} widthClass="60" manageFocus>
    <QseStatementTradeReviewContent {...props} />
  </Modal>;
}

export function QseStatementTradeReviewContent({ preview, onClose }: { preview: QseStatementTradePreview; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const addable = preview.rows.filter(row => !row.match && !row.conflict);
  const matches = preview.rows.filter(row => row.match && !row.conflict);
  const conflicts = preview.rows.filter(row => row.conflict);
  const filtered = preview.rows.filter(row => {
    const category = row.conflict ? 'conflicts' : row.match ? 'matches' : 'new';
    return (filter === 'all' || filter === category) &&
      `${row.incoming.ticker} ${row.incoming.date}`.toLowerCase().includes(search.trim().toLowerCase());
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
      toast(result.added || result.updated ? `Added ${result.added} trades and updated ${result.updated} matched trades.` : 'The selected trades already match the ledger.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected trades could not be imported.');
    }
  };

  return <div className="stack-md">
      <p>{preview.fileName} · {preview.brokerName}</p>
      <Notice tone="warning">The statement rounds cash amounts and commissions. Trade values use the statement’s shares and price with the broker’s configured fees. Existing fee overrides are kept. This review imports trades only.</Notice>
      <div className="row gap-sm">
        <StatCard2 label="New" value={addable.length} />
        <StatCard2 label="Matched" value={matches.length} />
        <StatCard2 label="Needs review" value={conflicts.length} />
      </div>
      <p>Leave matches unchecked to keep the existing values. Leave new trades unchecked to skip them.</p>
      <div className="row gap-sm">
        <StandardButton tone="secondary" disabled={!addable.length} onClick={() => select(addable.map(row => row.index), true)}>Select all new trades</StandardButton>
        <StandardButton tone="secondary" disabled={!matches.length} onClick={() => select(matches.map(row => row.index), true)}>Use statement for all matches</StandardButton>
        <StandardButton tone="secondary" disabled={!matches.length} onClick={() => select(matches.map(row => row.index), false)}>Keep all existing matches</StandardButton>
        <StandardButton tone="secondary" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</StandardButton>
      </div>
      <div className="row gap-sm">
        <Field label="Show trades"><Select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="new">New</option><option value="matches">Matched</option><option value="conflicts">Needs review</option></Select></Field>
        <Field label="Filter by symbol or date"><TextInput value={search} onChange={event => setSearch(event.target.value)} /></Field>
      </div>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      <div className="row gap-sm">
        <StandardButton disabled={!selected.size} onClick={apply}>Import selected trades ({selected.size})</StandardButton>
        <StandardButton tone="secondary" onClick={onClose}>Cancel</StandardButton>
      </div>
      {controls}
      {rows.map(({ index, incoming, match, conflict }) => <section key={index} className="stack-sm" aria-label={`${incoming.ticker} ${incoming.date} ${incoming.action}, statement trade ${index + 1}`}>
        <h4>{incoming.ticker} · {incoming.date} · {incoming.action}</h4>
        <div className="grid-auto">
          {(conflict?.existing ?? (match ? [match] : [])).map((trade, at) => <TradeCard key={trade.id ?? at} title="Existing" trade={trade} currency={preview.currency} />)}
          <TradeCard title={match || conflict ? 'Statement' : 'New statement trade'} trade={incoming} currency={preview.currency} />
        </div>
        {conflict
          ? <Notice tone="warning">{conflict.message} Existing trades are kept.</Notice>
          : <label>
            <input type="checkbox" checked={selected.has(index)} onChange={event => select([index], event.target.checked)} />
            {match ? ' Use statement values for this match' : ' Import this new trade'}
          </label>}
      </section>)}
  </div>;
}
