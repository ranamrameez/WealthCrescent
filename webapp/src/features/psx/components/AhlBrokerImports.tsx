import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StandardButton } from '../../../components/standard/Button';
import { Field, TextInput } from '../../../components/ui/Field';
import { toast } from '../../../components/Toast';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { parseAhlOrderHistory } from '../../../lib/ahlOrderHistory';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { readPsxBrokerTables } from '../../../lib/psxCashStatement';
import { applyAhlOrderReview, prepareAhlOrderReview } from '../../../services/finance/ahlOrderReview';
import { isAhlBroker } from '../../../services/finance/psxCashTransferReview';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { PsxCashTransferActions } from './PsxCashTransferActions';

type Preview = ReturnType<typeof prepareAhlOrderReview>;

function OrderReview({ preview, close }: { preview: Preview; close: () => void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const { rows, controls } = useTablePagination(preview.rows);
  const newIds = preview.rows.filter(row => row.status === 'new').map(row => row.fill.sourceId);
  const save = () => {
    try {
      const added = applyAhlOrderReview(preview, selected);
      toast(`Imported ${added} AHL fills.`);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save fills.');
    }
  };

  return <div className="stack-md">
    <p>Review fills for <strong>{preview.brokerName}</strong>. Trade dates come from Execution Date. Fees use the broker profile’s settings.</p>
    <p>Review overlapping fills against your existing trades before selecting them. Identical fills already in the ledger stay unselected.</p>
    {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
    <div className="row gap-sm">
      <StandardButton tone="secondary" disabled={!newIds.length} onClick={() => setSelected(new Set(newIds))}>Select all new fills</StandardButton>
      <StandardButton tone="secondary" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</StandardButton>
      <StandardButton disabled={!selected.size} onClick={save}>Import selected ({selected.size})</StandardButton>
    </div>
    <div className="table-scroll">
      <table>
        <thead><tr><th scope="col">Import</th><th scope="col">Execution</th><th scope="col">Clearing</th><th scope="col">Ticker</th><th scope="col">Side</th><th scope="col">Shares</th><th scope="col">Price (PKR)</th><th scope="col">Status</th></tr></thead>
        <tbody>{rows.map(({ fill, status }) => <tr key={fill.sourceId}>
          <td><input type="checkbox" aria-label={`Import ${fill.ticker} ${fill.action} on ${fill.date}, fill ${fill.sourceId.split(':').at(-1)}`}
            checked={selected.has(fill.sourceId)} disabled={status === 'existing'} onChange={event => {
              const next = new Set(selected);
              if (event.target.checked) next.add(fill.sourceId);
              else next.delete(fill.sourceId);
              setSelected(next);
            }} /></td>
          <td>{fill.date}</td><td>{fill.clearingDate ?? '—'}</td><td>{fill.ticker}</td><td>{fill.action}</td>
          <td>{fill.shares}</td><td>{fill.price.toFixed(2)}</td>
          <td>{status === 'existing' ? 'Already recorded' : status === 'overlap' ? 'Review overlap' : 'New'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {controls}
  </div>;
}

function AhlOrderImportDialog({ brokerId, close }: { brokerId: string; close: () => void }) {
  const ensureSignedIn = useEnsureSignedIn();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const review = async (file: File) => {
    const requestedOwner = getCurrentUser()?.uid;
    setBusy(true);
    setError('');
    try {
      const { tables, dateSystem } = await readPsxBrokerTables(file);
      const fills = parseAhlOrderHistory(tables, dateSystem);
      if (await ensureSignedIn('Sign in to import AHL order history.')) {
        setPreview(prepareAhlOrderReview(fills, brokerId, requestedOwner));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read order history.');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title={preview ? 'Review AHL order history' : 'Import AHL order history'} onClose={close} widthClass={preview ? '60' : undefined} manageFocus>
    {preview ? <OrderReview preview={preview} close={close} /> : <div className="stack-md">
      <p>Choose an AHL order-history export containing executed buy and sell fills.</p>
      <Field label="AHL order history (.html, .txt, .csv or .xlsx)">
        <TextInput type="file" accept=".html,.htm,.txt,.csv,.xlsx" disabled={busy} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void review(file);
        }} />
      </Field>
      {busy && <p role="status">Preparing order history review…</p>}
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
    </div>}
  </Modal>;
}

export function AhlBrokerImports() {
  const broker = usePSXWorkbookStore(({ workbook }) => workbook.brokerProfiles.find(profile => profile.id === workbook.activeBrokerId));
  const [openFor, setOpenFor] = useState<string>();
  if (!broker || broker.archived || broker.deactivated || !isAhlBroker(broker.id, broker.name)) return null;

  return <>
    <div className="row gap-sm">
      <StandardButton type="button" size="small" tone="secondary" onClick={() => setOpenFor(broker.id)}>Import AHL order history</StandardButton>
      <PsxCashTransferActions statementOnly label="Import AHL account statement (cash)" />
      <Link to="/psx/trade-journal">Review full AHL statement in Trade Journal</Link>
    </div>
    {openFor === broker.id && <AhlOrderImportDialog brokerId={broker.id} close={() => setOpenFor(undefined)} />}
  </>;
}
