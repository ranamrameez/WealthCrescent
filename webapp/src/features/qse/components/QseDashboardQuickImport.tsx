import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StandardButton } from '../../../components/standard/Button';
import { Field, TextInput } from '../../../components/ui/Field';
import { parseCSV } from '../../../lib/csv';
import { getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { readStatementXlsx } from '../../../lib/theGroupStatement';
import { prepareQseStatementTradeReview, type QseStatementTradePreview } from '../../../services/finance/qseStatementImportService';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useQSEStockData } from '../hooks/useQSEStockData';
import { QseStatementTradeReviewContent } from './QseStatementTradeReview';

export function QseDashboardQuickImport() {
  const [open, setOpen] = useState(false);
  return <>
    <StandardButton type="button" tone="secondary" size="small" onClick={() => setOpen(true)}>
      Import QSE trades
    </StandardButton>
    {open && <QuickImportDialog onClose={() => setOpen(false)} />}
  </>;
}

function QuickImportDialog({ onClose }: { onClose: () => void }) {
  const { tickerNames } = useQSEStockData();
  const ensureSignedIn = useEnsureSignedIn();
  const brokerName = useWorkbookStore(({ workbook }) =>
    workbook.brokerProfiles.find(broker => broker.id === workbook.activeBrokerId)?.name ?? 'Active QSE broker',
  );
  const [preview, setPreview] = useState<QseStatementTradePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reviewFile = async (file: File) => {
    setError('');
    setBusy(true);
    const requested = { owner: getCurrentUser()?.uid, brokerId: useWorkbookStore.getState().workbook.activeBrokerId };
    try {
      if (file.size > 10_000_000) throw new Error('Statement is too large (maximum 10 MB).');
      const table = /\.xlsx$/i.test(file.name)
        ? readStatementXlsx(new Uint8Array(await file.arrayBuffer()))
        : parseCSV(await file.text());
      setPreview(await prepareQseStatementTradeReview(table, file.name, tickerNames, requested, ensureSignedIn));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The statement could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title={preview ? 'Review The Group trades' : 'Import QSE trades'} onClose={onClose} widthClass={preview ? '60' : undefined} manageFocus>
    {preview ? <QseStatementTradeReviewContent preview={preview} onClose={onClose} /> : <div className="stack-md">
      <p>Import trades from The Group into <strong>{brokerName}</strong>.</p>
      <Field label="The Group statement (.xlsx or .csv)">
        <TextInput type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void reviewFile(file);
        }} />
      </Field>
      {busy && <p role="status">Preparing statement review…</p>}
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      <StandardButton type="button" tone="secondary" onClick={onClose}>Cancel</StandardButton>
    </div>}
  </Modal>;
}
