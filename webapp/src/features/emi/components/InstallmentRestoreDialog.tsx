import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { toast } from '../../../components/Toast';
import { StandardButton } from '../../../components/standard/Button';
import { Field, Select, TextInput } from '../../../components/ui/Field';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { fmtMoney } from '../../../lib/format';
import { applyInstallmentRestore, previewInstallmentRestore } from '../../../services/finance/installmentImportService';
import type { EMILoan, EMIWorkbook } from '../../../types/emiWorkbook';

type ArchiveOption = Pick<NonNullable<EMIWorkbook['reconciliationHistory']>[number], 'id' | 'sourceLabel' | 'createdAt'>;

export function InstallmentRestoreDialog({ loan, archives, onClose }: {
  loan: EMILoan;
  archives: ArchiveOption[];
  onClose: () => void;
}) {
  const [archiveId, setArchiveId] = useState(archives[0]?.id ?? '');
  const [preview, setPreview] = useState<ReturnType<typeof previewInstallmentRestore> | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const receipts = useTablePagination(preview?.archive.repayments ?? []);
  const obligations = useTablePagination(preview?.archive.loan.contractSchedule ?? []);

  const allocations = useTablePagination(preview?.archive.loan.paymentAllocations ?? []);
  const receiptDates = new Map((preview?.archive.repayments ?? []).map(row => [row.id, row.date]));
  const obligationDates = new Map((preview?.archive.loan.contractSchedule ?? []).map(row => [row.id, row.dueDate]));

  const clearReview = () => {
    setPreview(null);
    setAcknowledged(false);
    setConfirmation('');
    setError('');
  };

  const review = async () => {
    clearReview();
    setBusy(true);
    try {
      if (await ensureSignedIn('Sign in to review receipt recovery.')) {
        setPreview(previewInstallmentRestore(loan.id, archiveId));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The archive could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const restore = () => {
    if (!preview || !acknowledged || confirmation.trim() !== preview.loan.name) return;
    try {
      const result = applyInstallmentRestore(preview, confirmation);
      toast(result.changed ? 'Archive restored. The replaced ledger was saved in receipt history.' : 'The ledger already matches this archive.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The archive could not be restored.');
    }
  };

  return <Modal title={`Receipt archive for ${loan.name}`} onClose={onClose} manageFocus>
    <div className="stack-lg" aria-busy={busy}>
      <Field label="Archived snapshot">
        <Select value={archiveId} disabled={busy} onChange={event => { setArchiveId(event.target.value); clearReview(); }}>
          {archives.map(row => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString()} · {row.sourceLabel}</option>)}
        </Select>
      </Field>
      <StandardButton tone="secondary" disabled={busy || !archiveId} onClick={() => void review()}>Review archive</StandardButton>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      {preview && <>
        <Notice>Restoring replaces this loan’s current receipts and contract with the selected snapshot. The current ledger is saved in the archive first.</Notice>
        <p>Current receipts: {preview.payments.length}. Archived receipts: {preview.archive.repayments?.length ?? 0}.</p>
        {preview.archive.loan.contractSchedule?.length ? <>
          <div className="table-scroll"><table>
            <caption>Archived contract obligations</caption>
            <thead><tr><th>Due date</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>{obligations.rows.map(row => <tr key={row.id}><td>{row.dueDate}</td><td>{row.description}</td><td>{fmtMoney(row.amount, preview.archive.loan.currencyCode)}</td></tr>)}</tbody>
          </table></div>
          {obligations.controls}
        </> : <p>This archive uses the legacy loan schedule.</p>}
        {!!preview.archive.repayments?.length && <>
          <div className="table-scroll"><table>
            <caption>Archived receipts</caption>
            <thead><tr><th>Actual date</th><th>Description</th><th>Amount</th><th>Fine</th></tr></thead>
            <tbody>{receipts.rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.description ?? '—'}</td><td>{fmtMoney(row.amount, preview.archive.loan.currencyCode)}</td><td>{row.fine == null ? '—' : fmtMoney(row.fine, preview.archive.loan.currencyCode)}</td></tr>)}</tbody>
          </table></div>
          {receipts.controls}
        </>}
        {preview.archive.loan.paymentAllocations?.length ? <>
          <div className="table-scroll"><table>
            <caption>Archived manual payment allocations</caption>
            <thead><tr><th>Receipt date</th><th>Receipt ID</th><th>Obligation due date</th><th>Obligation ID</th><th>Allocated amount</th></tr></thead>
            <tbody>{allocations.rows.map((row, index) => <tr key={index}>
              <td>{receiptDates.get(row.paymentId) ?? '—'}</td>
              <td>{row.paymentId}</td>
              <td>{obligationDates.get(row.obligationId) ?? '—'}</td>
              <td>{row.obligationId}</td>
              <td>{fmtMoney(row.amount, preview.archive.loan.currencyCode)}</td>
            </tr>)}</tbody>
          </table></div>
          {allocations.controls}
        </> : null}
        <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I reviewed the archived contract and receipts.</label>
        <Field label={`Type ${preview.loan.name} to confirm restoration`}>
          <TextInput value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </Field>
        <StandardButton disabled={!acknowledged || confirmation.trim() !== preview.loan.name} onClick={restore}>Restore reviewed archive</StandardButton>
      </>}
      <StandardButton tone="secondary" onClick={onClose}>Cancel</StandardButton>
    </div>
  </Modal>;
}
